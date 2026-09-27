const fieldNames={seller:'卖方名称及地址',buyer:'买方名称及地址',invoiceNumber:'发票编号',invoiceDate:'发票日期',lcNumber:'信用证号'};
const docNames={invoice:'发票',packingList:'装箱单'};
function issueText(issue){const key=issue.path.split('.')[1];if(issue.code==='MISSING_FIELD')return '请填写'+(fieldNames[key]||key);if(issue.code==='UNCONFIRMED_FIELD')return '请核对'+(fieldNames[key]||key);if(issue.code==='MISSING_FIELD_SCOPE')return (docNames[issue.document]||'单据')+'须保留'+(fieldNames[key]||key);return issue.message;}
function fail(page,error){console.error(error);const message=error.message||error.errMsg||'操作失败，请重试';if(page)page.setData({error:message});wx.showToast({title:'操作未完成，请查看提示',icon:'none'});}
function notify(title){wx.showToast({title,icon:'none'});}
function cancel(error){return /cancel/i.test(error.errMsg||'');}
function tab(page,index){if(page.getTabBar&&page.getTabBar())page.getTabBar().setData({selected:index});}
module.exports={fieldNames,docNames,issueText,fail,notify,cancel,tab};
