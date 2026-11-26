import { createLobbyController } from './online-rooms.mjs';
import { createMatchController, follows } from './online-match.mjs';
import { boardReady } from './offline.mjs';

const messages = {
  ROOM_FULL: 'Phòng đã đủ người.', ROOM_UNAVAILABLE: 'Mã không hợp lệ hoặc phòng đã đóng / hết hạn.',
  ALREADY_IN_ROOM: 'Bạn đang ở một phòng khác. Hãy rời phòng đó trước.', FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này.',
  STALE_ROOM: 'Phòng vừa thay đổi. Đang cập nhật; hãy kiểm tra rồi thử lại.', INVALID_INPUT: 'Thông tin chưa hợp lệ.',
  CODE_UNAVAILABLE: 'Chưa tạo được mã phòng. Vui lòng thử lại sau.', AUTH_REQUIRED: 'Phiên kết nối hết hiệu lực. Hãy thử kết nối lại.',
  OFFLINE: 'Mất mạng. Sẽ kết nối lại khi có mạng.', TIMEOUT: 'Kết nối quá lâu. Yêu cầu chưa được xác nhận.',
  UNAVAILABLE: 'Chưa kết nối được. Đang thử lại; trạng thái phòng chưa được xác nhận.',
  INVALID_RESPONSE: 'Chưa xác minh được trạng thái ván. Đã khóa bàn; hãy kết nối lại.',
  STALE_VERSION: 'Ván vừa có nước mới. Đang đồng bộ; hãy chọn lại sau khi cập nhật.',
  NOT_YOUR_TURN: 'Chưa đến lượt bạn.', ILLEGAL_ACTION: 'Nước không hợp lệ. Đang cập nhật bàn.',
  GAME_OVER: 'Ván đã kết thúc. Đang lấy kết quả.', NOT_FOUND: 'Không xác minh được quyền vào ván này.',
  NOT_READY: 'Phòng chưa sẵn sàng bắt đầu.', REQUEST_CONFLICT: 'Yêu cầu chưa khớp. Đã khóa bàn để đồng bộ.',
  RECEIPT_LIMIT: 'Ván đã đạt giới hạn yêu cầu. Chưa thể gửi thêm nước.',
};

export function mountOnlineLobby() {
  if (new URLSearchParams(location.search).get('onlinePreview') !== '1' || document.getElementById('online-lobby')) return;
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = new URL('../online-lobby.css', import.meta.url).href; document.head.append(css);
  const dialog = document.createElement('dialog'); dialog.id = 'online-lobby'; dialog.className = 'online-lobby';
  dialog.setAttribute('aria-labelledby', 'online-title');
  dialog.innerHTML = `<header><h2 id="online-title">Online preview</h2><button type="button" id="online-close" autofocus>Đóng</button></header>
    <p>Chơi Online thử nghiệm — chỉ trong preview</p>
    <p id="online-status" role="status" aria-live="polite" aria-atomic="true"></p>
    <button type="button" id="online-retry" hidden>Thử kết nối lại</button>
    <section id="online-entry"><button type="button" id="online-create">Tạo phòng</button>
      <form id="online-join-form"><label for="online-code-input">Mã mời 6 số</label>
        <div class="online-row"><input id="online-code-input" type="text" inputmode="numeric" autocomplete="off" maxlength="12" pattern="[0-9]{6}" required aria-describedby="online-code-hint"><button type="submit" id="online-join">Tham gia phòng</button></div>
        <small id="online-code-hint">Giữ cả số 0 đầu. Bạn có thể dán mã.</small></form></section>
    <section id="online-room" hidden><div class="online-row"><span>Mã phòng: <output id="online-code"></output></span><button type="button" id="online-copy">Sao chép mã</button></div>
      <ul><li id="online-seat-1"></li><li id="online-seat-2"></li></ul><p id="online-room-state"></p>
      <p id="online-expiry"></p><button type="button" id="online-start" hidden>Bắt đầu ván Online</button><button type="button" id="online-leave"></button></section>
    <p id="online-match-status" role="status" aria-live="polite"></p>
    <small>Phòng có hiệu lực 20 phút. Tải lại cùng trình duyệt sẽ tìm lại chỗ của bạn. Xóa dữ liệu trình duyệt hoặc đổi máy có thể mất danh tính khách.</small>`;
  document.body.append(dialog);
  const el = id => dialog.querySelector('#online-' + id);
  let storage; try { storage = localStorage; } catch { /* Memory-only session remains usable. */ }
  let lease, previousMatch, matchState, boardView, entering = false;
  const backButtons = [];
  const matchController = createMatchController({ storage, onChange: renderMatch });
  const controller = createLobbyController({ storage, onChange: render });
  const matchMessage = state => state.error === 'RATE_LIMIT' ? `Thao tác nhanh. Chờ ${state.retryAfter} giây.` : state.error ? (messages[state.error] ?? messages.UNAVAILABLE) :
    state.pending ? 'Đang xác nhận nước…' : !state.ready ? 'Đang đồng bộ…' : 'Online preview · Trở về Offline trong Cài đặt.';
  function startButton() {
    const state = controller.snapshot(), room = state.room;
    el('start').hidden = room?.role !== 'host' || room?.lobbyStatus !== 'full';
    el('start').disabled = state.phase !== 'ready' || state.busy || state.pending || !matchState?.ready || matchState.pending || !!matchState.match;
  }
  function renderMatch(state) {
    matchState = state;
    el('match-status').textContent = state.error || state.pending ? matchMessage(state) : '';
    startButton();
    if (!state.match || state.phase === 'closed') return;
    if (!lease) {
      if (!boardView || state.phase === 'paused') return;
      lease = boardView.take({ player: state.match.player, submit: action => matchController.act(action) });
      entering = true; dialog.close(); controller.stop(); entering = false;
      for (const panel of document.querySelectorAll(':popover-open')) panel.hidePopover();
      backButtons.forEach(button => { button.hidden = false; });
      document.querySelector('#cell-0').focus({ preventScroll: true });
    }
    const event = follows(previousMatch,state.match) ? state.match.event : null;
    lease.show(state.match, { interactive: state.ready && !state.pending, message: matchMessage(state),
      shortStatus: state.error === 'OFFLINE' ? 'Mất mạng · Bàn tạm khóa' : state.pending ? 'Đang xác nhận…' : 'Đang đồng bộ…', event });
    previousMatch = state.match;
  }
  function render(state) {
    const ready = state.phase === 'ready', room = state.room;
    el('status').textContent = state.phase === 'connecting' ? 'Đang kết nối phòng chờ…' :
      state.error === 'RATE_LIMIT' ? `Thao tác quá nhanh. Thử lại sau khoảng ${state.retryAfter} giây.` :
      state.error ? (messages[state.error] ?? messages.UNAVAILABLE) :
      state.busy ? 'Đang cập nhật…' : ready ? (room ? 'Đã kết nối phòng chờ.' : 'Đã kết nối. Tạo phòng hoặc nhập mã mời.') : 'Đã tạm dừng cập nhật.';
    el('retry').hidden = !['error', 'offline'].includes(state.phase);
    el('retry').disabled = state.retryAfter > 0 || state.phase === 'offline';
    el('entry').hidden = !!room; el('room').hidden = !room;
    for (const id of ['create', 'join', 'leave']) el(id).disabled = !ready || state.busy || state.pending;
    if (room) {
      el('code').textContent = room.code;
      el('seat-1').textContent = `Người 1 — Chủ phòng${room.role === 'host' ? ' (Bạn)' : ''}`;
      el('seat-2').textContent = room.seats[1] ? `Người 2 — Khách${room.role === 'guest' ? ' (Bạn)' : ''}` : 'Người 2 — Đang chờ';
      el('room-state').textContent = room.lobbyStatus === 'full' ? (room.role === 'host' ? 'Đã đủ 2 người. Bạn có thể bắt đầu ván.' : 'Đang chờ chủ phòng bắt đầu…') : 'Đang chờ người thứ hai nhập mã.';
      el('expiry').textContent = `Hết hạn lúc ${new Date(room.expiresAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}.`;
      el('leave').textContent = room.role === 'host' ? 'Hủy phòng' : 'Rời phòng';
    }
    startButton();
  }
  const resize = () => dialog.style.setProperty('--lobby-height', `${window.visualViewport?.height ?? innerHeight}px`);
  let returnFocus;
  function open(button) {
    if (lease) { matchController.retry(); return; }
    if (dialog.open) return;
    returnFocus = button;
    for (const popover of document.querySelectorAll(':popover-open')) popover.hidePopover();
    resize(); dialog.showModal();
    controller.setVisible(document.visibilityState === 'visible'); controller.setOnline(navigator.onLine); controller.start();
    matchController.setVisible(document.visibilityState === 'visible'); matchController.setOnline(navigator.onLine); matchController.start();
  }
  for (const id of ['help-panel', 'settings-panel']) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'online-preview-open'; button.textContent = 'Online preview';
    button.addEventListener('click', () => open(button)); document.getElementById(id).append(button);
    const back = document.createElement('button'); back.type = 'button'; back.className = 'online-return'; back.hidden = true;
    back.textContent = 'Trở về Offline'; if (id === 'settings-panel') back.id = 'online-return';
    back.addEventListener('click', () => {
      if (!lease || (matchState?.match?.snapshot.status === 'playing' && !confirm('Trở về ván Offline đang giữ? Ván Online vẫn còn trên server; đây không phải chịu thua.'))) return;
      matchController.stop(); lease.release(); lease = null; previousMatch = null;
      backButtons.forEach(b => { b.hidden = true; });
      for (const panel of document.querySelectorAll(':popover-open')) panel.hidePopover();
    });
    document.getElementById(id).append(back); backButtons.push(back);
  }
  el('close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    controller.stop();
    if (!lease && !entering) matchController.stop();
    const fallback = document.querySelector('[popovertarget="help-panel"]');
    (returnFocus?.getClientRects().length ? returnFocus : fallback)?.focus();
  });
  el('create').addEventListener('click', () => controller.act('create'));
  el('start').addEventListener('click', () => matchController.startGame(controller.snapshot().room));
  el('code-input').addEventListener('input', () => { el('code-input').value = el('code-input').value.replace(/\s+/g, ''); });
  el('join-form').addEventListener('submit', event => { event.preventDefault(); controller.act('join', el('code-input').value); });
  el('leave').addEventListener('click', () => {
    const room = controller.snapshot().room;
    if (room && confirm(room.role === 'host' ? 'Hủy phòng chờ này? Khách sẽ rời phòng.' : 'Rời phòng chờ này?')) controller.act(room.role === 'host' ? 'cancel' : 'leave');
  });
  el('copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(el('code').textContent); el('status').textContent = 'Đã sao chép mã phòng.'; }
    catch { const range = document.createRange(); range.selectNodeContents(el('code')); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); el('status').textContent = 'Hãy sao chép mã đang được chọn.'; }
  });
  el('retry').addEventListener('click', () => { controller.retry(); matchController.retry(); });
  document.addEventListener('visibilitychange', () => { controller.setVisible(document.visibilityState === 'visible'); matchController.setVisible(document.visibilityState === 'visible'); });
  window.addEventListener('offline', () => { controller.setOnline(false); matchController.setOnline(false); });
  window.addEventListener('online', () => { controller.setOnline(true); matchController.setOnline(true); });
  window.addEventListener('pagehide', () => { controller.stop(); matchController.stop(); });
  window.addEventListener('pageshow', () => { if (dialog.open) controller.start(); if (dialog.open || lease) matchController.start(); });
  window.visualViewport?.addEventListener('resize', resize); window.addEventListener('resize', resize);
  boardReady.then(view => { boardView = view; open(); });
}
