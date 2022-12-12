import { app, BrowserWindow, BrowserView, ipcMain, globalShortcut } from 'electron'
import { release } from 'os'
import { join } from 'path'
import fs from 'fs'

// Disable GPU Acceleration for Windows 7
if (release().startsWith('6.1')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

// Remove electron security warnings
// This warning only shows in development mode
// Read more on https://www.electronjs.org/docs/latest/tutorial/security
// process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'

export const ROOT_PATH = {
  // /dist
  dist: join(__dirname, '../..'),
  // /dist or /public
  public: join(__dirname, app.isPackaged ? '../..' : '../../../public'),
}

let win: BrowserWindow | null = null
let view: BrowserView | null = null
// Here, you can also use other preload
const preload = join(__dirname, '../preload/index.js')
const url = process.env.VITE_DEV_SERVER_URL as string
const indexHtml = join(ROOT_PATH.dist, 'index.html')

async function createWindow() {
  win = new BrowserWindow({
    title: 'Main window',
    icon: join(ROOT_PATH.public, 'favicon.ico'),
    width: 1280,
    height: 720,
    webPreferences: {
      preload,
      // Warning: Enable nodeIntegration and disable contextIsolation is not secure in production
      // Consider using contextBridge.exposeInMainWorld
      // Read more on https://www.electronjs.org/docs/latest/tutorial/context-isolation
      nodeIntegration: true,
      contextIsolation: false,
    },
    frame: false
  })

  if (app.isPackaged) {
    win.loadFile(indexHtml)
  } else {
    win.loadURL(url)
    // Open devTool if the app is not packaged
    win.webContents.openDevTools()
  }

  // Test actively push message to the Electron-Renderer
  win.webContents.on('did-finish-load', () => {
    //
  })

  win.on('resize', () => {
    if (!view) return
    const { width, height } = win.getBounds();
    const navWidth = Math.floor(width * 0.1)
    const headHeight = height - Math.floor(height * 0.95)
    view.setBounds({ x: navWidth, y: headHeight, width: width - navWidth, height })
  })
}

app.whenReady().then(async () => {
  createWindow()
})

app.on('window-all-closed', () => {
  win = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', () => {
  if (win) {
    // Focus on the main window if the user tried to open another
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    createWindow()
  }
})

const injectListener = async (view) => {
  try {
    view.webContents.debugger.attach('1.3');
  } catch (err) {
    console.log('Debugger attach failed: ', err);
  }
  view.webContents.debugger.on('detach', (event, reason) => {
    console.log('Debugger detached due to: ', reason);
  });
  view.webContents.debugger.on('message', (event, method, params) => {
    if (method === 'Network.responseReceived') {
      console.log(params.response.url)
      if (params.response.url.endsWith('.png')) {
        view.webContents.debugger.sendCommand('Network.getResponseBody', { requestId: params.requestId }).then(function (response) {
          console.log(response.body)
          // DEBUG: 保存base64图片
          try {
            const tmp = params.response.url.split('/')
            const fileName = tmp[tmp.length - 1]
            fs.writeFile('./tmp/' + fileName, Buffer.from(response.body, 'base64'), console.log)
          } catch (e) {
            console.error('保存网络图片DEBUG、如不需要请删除代码', e)
          }
        });
      }
    }
  });
  view.webContents.debugger.sendCommand('Network.enable');
}

let curKey: string;
const views = {};
const viewHistory = {}
const addviewHistory = (key: string, url: string) => {
  if (!viewHistory[key]) viewHistory[key] = []
  // 判断在最新页面
  if (viewHistory[key][viewHistory[key].length - 1] === url) return
  viewHistory[key].push(url)
  if (viewHistory[key].length >= 100) viewHistory[key].shift()
}
ipcMain.handle('view-release', (event, key) => {
  win.setBrowserView(null);
  view = null;
  views[key] = null;
});
// new window example arg: new windows url
ipcMain.handle('tab-change', (event, { key, url }) => {
  if (curKey === key) return { success: true }
  // 子窗口
  view = views[key];
  if (!view) {
    view = new BrowserView({
      webPreferences: {
        partition: 'persist:' + key,
      },
    });
    views[key] = view;
    // 植入监听
    injectListener(view)
    // 查找监听
    view.webContents.on('found-in-page', (event, result) => {
      console.log(result)
    })
    // 新窗口拦截
    view.webContents.setWindowOpenHandler((details) => {
      view.webContents.loadURL(details.url)
      return { action: 'deny' }
    })
    // 监听网址变化
    view.webContents.on('did-navigate', (e, url) => {
      if (url.startsWith('http')) win.webContents.send('address-change', url)
      addviewHistory(key, url)
    })
    view.webContents.loadURL(url)
  }
  win.setBrowserView(view)
  const { width, height } = win.getBounds();
  const navWidth = Math.floor(width * 0.1)
  const headHeight = height - Math.floor(height * 0.95)
  view.setBounds({ x: navWidth, y: headHeight, width: width - navWidth, height })
  curKey = key;
  return { success: true }
})

ipcMain.handle('tab-close', () => {
  win.setBrowserView(null)
  curKey = null
})

let lastText = ''
ipcMain.handle('find-in-page', (event, text: string) => {
  if (!view) return null
  if (!text) return null
  const options = {
    findNext: false
  }
  if (lastText === text) {
    console.log(text, '下一个')
    options.findNext = true
  }
  const requestId = view.webContents.findInPage(text, options)
  lastText = text
  return requestId;
})

let max = false
ipcMain.handle('minimize', () => win.minimize())
ipcMain.handle('maximize', () => {
  if (max) {
    win.unmaximize()
    max = false
  } else {
    win.maximize()
    max = true
  }
})
ipcMain.handle('close', () => {
  win = null
  app.exit()
})
ipcMain.handle('open-url', (e, url) => {
  if (view) {
    view.webContents.loadURL(url)
  }
})

ipcMain.handle('page-back', (e, key, count) => {
  if (view && viewHistory[key].length) {
    viewHistory[key] = viewHistory[key].slice(0, viewHistory[key].length - count)
    view.webContents.loadURL(viewHistory[key].pop())
  }
})
ipcMain.handle('page-refresh', (e, key) => {
  if (view) {
    view.webContents.loadURL(view.webContents.getURL())
  }
})

// 注册快捷键
app.on('browser-window-focus', function () {
  globalShortcut.register('Ctrl + F', () => {
    if (win.isFocused()) {
      if (!view) return false
      win.webContents.send('show-find-in-page')
    }
  })
  globalShortcut.register('Ctrl + Shift + D + P', () => {
    win.webContents.openDevTools()
  })
});
// 注销快捷键
app.on('browser-window-blur', function () {
  globalShortcut.unregister('Ctrl + F')
  globalShortcut.unregister('Ctrl + Shift + D + P')
});
