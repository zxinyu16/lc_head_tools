const domain = require('./domain');
const KEY = 'lc-studio-local-v1';
const clone = value => JSON.parse(JSON.stringify(value));
function empty(){return {schema:1,activeId:'',businesses:[],templates:[],generations:[]};}
function read(){const raw=wx.getStorageSync(KEY);if(!raw)return empty();if(raw.schema!==1||!Array.isArray(raw.businesses)||!Array.isArray(raw.templates)||!Array.isArray(raw.generations))throw new Error('本地资料格式不兼容，请先备份，勿清理缓存');return clone(raw);}
function write(value){wx.setStorageSync(KEY,value);return clone(value);}
function change(fn){const state=read();fn(state);return write(state);}
function active(){const s=read();return s.businesses.find(b=>b.id===s.activeId)||null;}
function select(id){change(s=>{if(!s.businesses.some(b=>b.id===id))throw new Error('业务不存在');s.activeId=id;});}
function create(){const b=domain.createBusiness('新业务');change(s=>{s.businesses.unshift(b);s.activeId=b.id;});return b;}
function update(business){change(s=>{const index=s.businesses.findIndex(b=>b.id===business.id);if(index<0)throw new Error('业务不存在');s.businesses[index]=clone(business);});}
function duplicate(id){let result;change(s=>{const b=s.businesses.find(x=>x.id===id);if(!b)throw new Error('业务不存在');result=domain.duplicateBusiness(b);s.businesses.unshift(result);s.activeId=result.id;});return result;}
function archive(id){change(s=>{const b=s.businesses.find(x=>x.id===id);if(!b)throw new Error('业务不存在');b.archived=!b.archived;b.updatedAt=new Date().toISOString();});}
function saveTemplate(template){change(s=>{if(s.templates.some(t=>t.name===template.name))throw new Error('已有同名模板，请使用其他名称');s.templates.unshift(template);});}
function removeTemplate(id){change(s=>{s.templates=s.templates.filter(t=>t.id!==id);});}
function recordGeneration(snapshot,path){change(s=>{s.generations.unshift({snapshot,path});});}
module.exports={read,active,select,create,update,duplicate,archive,saveTemplate,removeTemplate,recordGeneration};
