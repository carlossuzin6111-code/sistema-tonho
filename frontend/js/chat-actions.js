async function editChatMessage(element) {
  const message = window.prompt('Editar mensagem:');
  if (!message?.trim()) return;
  try { await API.put(`/chat/${encodeURIComponent(element.dataset.messageId)}`, { message: message.trim() }); showToast('Mensagem editada.', 'success'); }
  catch (error) { showToast(error.message, 'error'); }
}
async function deleteChatMessage(element) {
  if (!window.confirm('Excluir esta mensagem?')) return;
  try { await API.delete(`/chat/${encodeURIComponent(element.dataset.messageId)}`); element.closest('.chat-bubble')?.remove(); showToast('Mensagem excluída.', 'success'); }
  catch (error) { showToast(error.message, 'error'); }
}
