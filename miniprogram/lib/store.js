const domain = require('./domain');
const KEY = 'lc-studio-local-v1';
const CORRUPT_KEY = KEY + '-corrupt-backup';
const clone = value => JSON.parse(JSON.stringify(value));
function empty(){return {schema:1,activeId:'',businesses:[],templates:[],generations:[]};}
function validShape(state){return state&&state.schema===1&&Array.isArray(state.businesses)&&Array.isArray(state.templates)&&Array.isArray(state.generations);}
function validBusiness(b){return b&&typeof b.id==='string'&&b.id&&b.fields&&typeof b.fields==='object'&&Array.isArray(b.clauses)&&typeof b.name==='string';}
function read(){const raw=wx.getStorageSync(KEY);if(!raw)return empty();if(!validShape(raw)){try{wx.setStorageSync(CORRUPT_KEY,{keptAt:new Date().toISOString(),data:raw});}catch(e){console.error(e);}throw new Error('本地资料格式不兼容，原始数据已另存备份键，请先导出排查，勿清理缓存');}return clone(raw);}
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
function exportData(){const s=read();return {kind:'lc-studio-backup',schema:1,exportedAt:new Date().toISOString(),activeId:s.activeId,businesses:s.businesses,templates:s.templates,generations:s.generations};}
function inspectBackup(payload){if(!payload||payload.kind!=='lc-studio-backup')throw new Error('不是本工具生成的备份文件');const next={schema:1,activeId:typeof payload.activeId==='string'?payload.activeId:'',businesses:payload.businesses,templates:payload.templates,generations:payload.generations};if(!validShape(next)||next.businesses.some(b=>!validBusiness(b)))throw new Error('备份文件内容不完整或版本不兼容');if(new Set(next.businesses.map(b=>b.id)).size!==next.businesses.length)throw new Error('备份中存在重复业务编号');return {next,summary:{businesses:next.businesses.length,templates:next.templates.length,generations:next.generations.length}};}
function importData(payload){const {next,summary}=inspectBackup(payload);if(next.activeId&&!next.businesses.some(b=>b.id===next.activeId))next.activeId=next.businesses.length?next.businesses[0].id:'';write(next);return summary;}
module.exports={read,active,select,create,update,duplicate,archive,saveTemplate,removeTemplate,recordGeneration,exportData,inspectBackup,importData};
