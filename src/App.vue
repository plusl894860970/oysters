<script setup lang="ts">
// This starter template is using Vue 3 <script setup> SFCs
// Check out https://vuejs.org/api/sfc-script-setup.html#script-setup
import { ref, nextTick } from 'vue'
import { message } from 'ant-design-vue'
import { DeleteOutlined, EditOutlined, MinusOutlined, CloseOutlined, FullscreenOutlined, FullscreenExitOutlined, FileAddOutlined, FolderAddOutlined, CaretLeftFilled, ReloadOutlined } from '@ant-design/icons-vue'
import { ipcRenderer } from 'electron'
import { v4 } from 'uuid'
// 本地数据库
let db: IDBDatabase;
const indexedDb = window.indexedDB.open("Oysters", 1);
indexedDb.onupgradeneeded = function (event: any) {
  console.log('onupgradeneeded')
  const sessionGroupObjectStore = event.target.result.createObjectStore('sessionGroup', { keyPath: 'id', autoIncrement: true });
  sessionGroupObjectStore.createIndex('name', 'name', { unique: true });
  const sessionObjectStore = event.target.result.createObjectStore('session', { keyPath: 'id', autoIncrement: true });
  sessionObjectStore.createIndex('uuid', 'uuid', { unique: true });
}
indexedDb.onerror = function (event) {
  console.log('onerror')
  alert("Why didn't you allow my web app to use IndexedDB?!");
};
indexedDb.onsuccess = function (event: any) {
  console.log('onsuccess')
  db = event.target.result;
  getGroups()
}

const isShowAddPage = ref(false)
const pageForm = ref({
  group: '未分组',
  name: '新会话',
  url: 'https://www.baidu.com'
})

const treeData = ref([]);
let groups = []
let pages = []

const getGroups = () => {
  groups = []
  treeData.value = [
    {
      title: '未分组',
      key: '',
      children: [],
    },
  ]
  const transaction = db.transaction(['sessionGroup'], 'readwrite').objectStore('sessionGroup');
  const request = transaction.openCursor();
  request.onsuccess = function (event: any) {
    console.log('request success')
    const cursor = event.target.result;
    if (cursor) {
      // 使用Object.assign方法是为了避免控制台打印时出错
      const row = cursor.value
      console.log('group', row)
      groups.push(row)
      treeData.value.push({
        title: row.name,
        key: row.id,
        children: []
      })
      cursor.continue();
    } else {
      getViews()
    }
  };
}

const getViews = () => {
  pages = []
  const transaction = db.transaction(['session'], 'readwrite').objectStore('session');
  const request = transaction.openCursor();
  request.onsuccess = function (event: any) {
    console.log('request success')
    const cursor = event.target.result;
    if (cursor) {
      // 使用Object.assign方法是为了避免控制台打印时出错
      const row = cursor.value
      console.log('session', row)
      pages.push(row)
      if (!row.group) {
        treeData.value[0].children.push({
          title: row.name,
          key: row.uuid,
          isLeaf: true,
        })
      } else {
        const group = treeData.value.find(o => o.title === row.group)
        if (group) group.children.push({
          title: row.name,
          key: row.uuid,
          isLeaf: true,
        })
      }
      cursor.continue();
    }
  };
}

const addPage = () => {
  if (!pageForm.value.url) {
    message.info('URL不能为空')
    return
  }
  if (pageForm.value['id']) {
    modifySubmit()
    return
  }
  const view = {
    uuid: v4(),
    name: pageForm.value.name,
    url: pageForm.value.url,
    group: pageForm.value.group
  }
  const transaction = db.transaction(['session'], 'readwrite').objectStore('session');
  const request = transaction.add(view)
  request.onerror = (error) => {
    console.log('插入数据失败', error)
  }
  request.onsuccess = () => {
    isShowAddPage.value = false
    getGroups()
  }
}

const addGroup = () => {
  const transaction = db.transaction(['sessionGroup'], 'readwrite').objectStore('sessionGroup');
  const request = transaction.add({ name: groupForm.value.name })
  request.onerror = (error) => {
    console.log('插入分组数据失败', error)
  }
  request.onsuccess = () => {
    isShowAddGroup.value = false
    getGroups()
  }
}

const selectedKeys = ref<string[]>();
const expandedKeys = ref<string[]>([]);

const hideAll = async () => {
  await ipcRenderer.invoke('tab-close')
}

const newGroup = async () => {
  groupForm.value.name = `分组(${treeData.value.length})`
  isShowAddGroup.value = true
  await ipcRenderer.invoke('tab-close')
}
const newPage = async () => {
  delete pageForm.value['id']
  delete pageForm.value['uuid']
  pageForm.value.name = `会话(${Date.now()})`
  isShowAddPage.value = true
  await ipcRenderer.invoke('tab-close')
}

const curPage = ref()
const openPage = async (keys: string[]) => {
  const page = pages.find(o => o.uuid === keys[0])
  curPage.value = page
  if (!page) return
  await ipcRenderer.invoke('tab-change', { key: page.uuid, url: page.url })
}

const confirmDel = (row: { key: string }) => {
  const page = pages.find(o => o.uuid === row.key)
  if (!page) return
  const transaction = db.transaction(['session'], 'readwrite').objectStore('session');
  const request = transaction.delete(page.id);
  request.onsuccess = () => {
    message.success('删除')
    getGroups()
    // 后端释放内存
    ipcRenderer.invoke('view-release', page.uuid)
  }
  request.onerror = (error: any) => {
    message.error(error.message)
  }
};

const cancelDel = (e: MouseEvent) => {
  console.log(e);
};

const modify = async (row: { key: string }) => {
  await ipcRenderer.invoke('tab-close')
  const page = pages.find(o => o.uuid === row.key)
  console.log(page)
  Object.assign(pageForm.value, page)
  isShowAddPage.value = true
}
const modifySubmit = () => {
  const transaction = db.transaction(['session'], 'readwrite').objectStore('session');
  const request = transaction.put(JSON.parse(JSON.stringify(pageForm.value)));
  request.onsuccess = () => {
    console.log('修改成功')
    isShowAddPage.value = false
    getGroups()
  }
  request.onerror = (error: any) => {
    message.error(error.message)
  }
}

// 窗口控制
const isMax = ref(false)
const minus = async () => {
  await ipcRenderer.invoke('minimize')
}

const maxOrUnmax = async () => {
  await ipcRenderer.invoke('maximize')
  isMax.value = !isMax.value
}

const close = async () => {
  await ipcRenderer.invoke('close')
}

// 搜索
const showFindInPage = ref(false)
const findInpageText = ref('')
const findInPageInput = ref()
const findInPage = async (val) => {
  if (!val) return
  const requestId = await ipcRenderer.invoke('find-in-page', findInpageText.value)
  console.log(requestId)
}

ipcRenderer.on('show-find-in-page', () => {
  showFindInPage.value = !showFindInPage.value
  if (showFindInPage.value) {
    console.log(findInPageInput.value)
    if (findInPageInput.value) {
      nextTick(() => {
        setTimeout(() => {
          findInPageInput.value.focus()
        }, 500)
      })
    }
  }
})

// 新建分组
const isShowAddGroup = ref(false)
const groupForm = ref({
  name: '',
})

// 网址
const addresText = ref(null)
ipcRenderer.on('address-change', (e, data) => {
  addresText.value = data
})
const openUrl = async () => {
  if (!addresText.value.startsWith('https://') || !addresText.value.startsWith('http://')) addresText.value = 'https://' + addresText.value
  await ipcRenderer.invoke('open-url', addresText.value)
}

// 后退
let backCount = 0
const back = async () => {
  backCount++
  setTimeout(async () => {
    const count = Math.floor(backCount);
    backCount = 0;
    await ipcRenderer.invoke('page-back', curPage.value.uuid, count)
  }, 200);
}
// 刷新
const refresh = async () => {
  await ipcRenderer.invoke('page-refresh', curPage.value.uuid)
}
</script>

<template>
  <div class="header">
    <a-row>
      <a-col :span="4">
        <div style="padding-left: 15px">Oysters</div>
      </a-col>
      <a-col :span="16">
        <a-input class="head-input" ref="findInPageInput" v-show="showFindInPage" v-model:value="findInpageText"
          placeholder="页内搜索" @keyup.enter="findInPage" />
        <div v-if="addresText !== null && !showFindInPage">
          <a-row>
            <a-col :span="1">
              <div class="head-btn" @click="back">
                <CaretLeftFilled />
              </div>
            </a-col>
            <a-col :span="1">
              <div class="head-btn" @click="refresh">
                <ReloadOutlined />
              </div>
            </a-col>
            <a-col :span="22">
              <a-input class="head-input" v-model:value="addresText" placeholder="输入网址" @keyup.enter="openUrl" />
            </a-col>
          </a-row>
        </div>
      </a-col>
      <a-col :span="4">
        <a-row>
          <a-col :span="8">
            <div class="btn" @click="minus">
              <MinusOutlined />
            </div>
          </a-col>
          <a-col :span="8">
            <div class="btn" @click="maxOrUnmax">
              <FullscreenExitOutlined v-if="isMax" />
              <FullscreenOutlined v-if="!isMax" />
            </div>
          </a-col>
          <a-col :span="8">
            <div class="btn" @click="close">
              <CloseOutlined />
            </div>
          </a-col>
        </a-row>
      </a-col>
    </a-row>
  </div>
  <div style="width: 100vw; height: 95vh; overflow-y: scroll">
    <div style="width: 10vw">
      <div style="width: 10vw; text-align: center" @click="hideAll">
        <a-row>
          <a-col :span="12">
            <div class="add-btn" @click="newPage">
              <FileAddOutlined />
            </div>
          </a-col>
          <a-col :span="12">
            <div class="add-btn" @click="newGroup">
              <FolderAddOutlined />
            </div>
          </a-col>
        </a-row>
      </div>
      <a-directory-tree v-model:expandedKeys="expandedKeys" v-model:selectedKeys="selectedKeys" :tree-data="treeData"
        @select="openPage">
        <template #title="row">
          <a-dropdown :trigger="['contextmenu']">
            <span>{{ row.title }}</span>
            <template #overlay>
              <a-menu>
                <a-menu-item @click="modify(row)" key="1">编辑
                  <EditOutlined />
                </a-menu-item>
                <a-menu-item key="2">
                  <a-popconfirm title="确定删除?" ok-text="是" cancel-text="否" @confirm="confirmDel(row)"
                    @cancel="cancelDel">
                    删除
                    <DeleteOutlined style="color: red" />
                  </a-popconfirm>
                </a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
        </template>
      </a-directory-tree>
    </div>
    <a-modal v-model:visible="isShowAddPage" title="新建会话" @ok="addPage" ok-text="确定" cancel-text="取消">
      <div style="padding: 15px">
        <a-form>
          <a-form-item label="分组">
            <a-select v-model:value="pageForm.group" style="width: 120px">
              <a-select-option v-for="group in treeData" :value="group.title">{{ group.title }}</a-select-option>
            </a-select>
          </a-form-item>
          <a-form-item label="名称">
            <a-input v-model:value="pageForm.name" placeholder="请输入名称" />
          </a-form-item>
          <a-form-item label="地址">
            <a-input v-model:value="pageForm.url" placeholder="请输入地址" />
          </a-form-item>
        </a-form>
      </div>
    </a-modal>
    <a-modal v-model:visible="isShowAddGroup" title="新建分组" @ok="addGroup" ok-text="确定" cancel-text="取消">
      <div style="padding: 15px">
        <a-form>
          <a-form-item label="分组名称">
            <a-input v-model:value="groupForm.name" placeholder="请输入名称" />
          </a-form-item>
        </a-form>
      </div>
    </a-modal>
  </div>
</template>

<style scoped>
.header {
  width: 100vw;
  height: 5vh;
  overflow: hidden;
  background: #35363a;
  -webkit-app-region: drag;
  line-height: 5vh;
  color: white;
}

.btn {
  text-align: center;
}

.btn:hover {
  background-color: #8da7b0;
}

.add-btn {
  color: black;
  background-color: #f1f3f3;
  border-radius: 25px;
  width: 80%;
  height: 2vw;
  line-height: 2vw;
  margin: 10px auto;
}

.add-btn:hover {
  background-color: #2194fc;
  color: white;
}

.head-input {
  background-color: #202122 !important;
  color: #fefefd !important;
  border-radius: 46px !important;
  width: 80% !important;
  height: 31px !important;
  border: none;
}

.head-btn {
  background-color: #35363a !important;
  color: #fefefd !important;
  border-radius: 50% !important;
  width: 31px !important;
  height: 31px !important;
  text-align: center !important;
  border: none !important;
  margin-right: 15px !important;
}

.head-btn:hover {
  background-color: #202122 !important;
}
</style>
