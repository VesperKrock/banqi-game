# R5-02B — Online client gameplay preview

Nghiệm thu 2026-11-26, baseline `6d43efa`: **PASS targeted + live hai client**.
Gameplay chỉ được tải từ `?onlinePreview=1`. URL thường giữ Offline/Solo;
không tải Online module/CSS/SDK/Auth/Edge. Không làm R5-03.

## Luồng chơi và quyền sở hữu bàn

Chủ tạo phòng, khách nhập mã 6 số. Khi đủ ghế, chỉ chủ có nút **Bắt đầu ván
Online**. Client dùng `banqi-match.start`; phòng đầy không tự trở thành ván.
Hai máy tìm ván qua `getMine`, đóng lobby và hiển thị trên cùng 32 ô hiện có.
Host là người 1/player 0; guest là người 2/player 1. Lượt đầu, màu, nước đi,
trường tróc và kết quả đều từ server.

`offline.mjs` cung cấp một public view lease. Khi Online giữ bàn, input click,
keyboard và Drag chỉ gọi controller Online; không gọi local `applyAction`.
Bot bị hủy, callback cũ bị chặn bằng session/position; local private state và
lịch sử ván vẫn giữ trong closure. Không có setter/getter private state.
Renderer, SVG/fallback, accessibility, cảnh báo, Soul Fade và sound dùng lại.
Ván mới/chọn mode Offline bị khóa trong khi xem Online.

Trong **Cài đặt/Trợ giúp → Trở về Offline**, xác nhận chỉ thoát chế độ xem;
không phải xin thua/hủy ván. Lease trả lại input, board, focus và ván Offline
đã giữ. Chọn Online preview lần nữa để lấy trạng thái server mới trước khi
chơi tiếp. Reload giữ Anonymous identity và tìm lại ván. Xóa site storage
hoặc đổi máy có thể mất quyền truy cập ghế; không hứa phục hồi tùy ý.

## Transport, retry và bảo vệ dữ liệu

- `matchAction` dùng chính SDK/Auth singleton R5-01, không tạo client thứ hai.
  API thực tế: `getMine`, `snapshot`, `start`, `act`; lobby vẫn dùng
  `create/join/getMine/leave/cancel`. Không sửa/deploy migration hay Edge.
- Deep allowlist kiểm tra 32 ô, màu, player/version, captured, result, event,
  mọi cấu trúc chase. Quân úp chỉ `{occupied:true,faceDown:true}`. Extra fields
  hoặc response sai trận/người/version bị từ chối, khóa input. Không đưa UID,
  JWT, receipt hay private state lên DOM/console.
- JSONB receipt và projection JavaScript có thể khác thứ tự khóa. Client
  chuẩn hóa sau validation để so sánh ngữ nghĩa, tránh khóa nhầm cùng version
  và bỏ hiệu ứng. Có test hồi quy riêng cho lỗi phát hiện trong live QA.
- Không optimistic commit. Mutation giữ UUID, room, baseVersion và action
  chính xác; khóa double-submit. Unknown outcome được retry nguyên command.
  Pending lưu vào localStorage theo UID đã xác minh; không chứa JWT/state.
  Ack xong thì xóa pending và đọc snapshot mới. Nếu storage không ghi được,
  retry trong bộ nhớ vẫn hoạt động nhưng pending không bảo đảm sống qua reload.
- STALE_VERSION bỏ command/lựa chọn cũ, đọc lại; không sửa baseVersion rồi
  tự chạy lại nước. Response từ generation cũ không được cập nhật UI.
- Poll mỗi **3 giây** khi visible/online: khoảng 20 snapshot/phút/UID khi
  đang chơi và rảnh. Một mutation thêm request act + snapshot xác nhận.
  Backoff 6–30 giây, tôn trọng RATE_LIMIT. Lobby và match có lifecycle riêng;
  close lobby vào game không ngắt match poll. Hidden/offline/thoát dừng poll;
  quay lại cần fresh state trước input. Không đoán đối phương disconnect.
- Chỉ animate khi event nối đúng một version và khớp public board trước đó.
  Gaps/reload render thẳng; poll cùng version không phát lại sound/effect.
  Final capture đợi Soul Fade rồi mở dialog; reduced motion giữ fade ngắn.

## QA và bằng chứng

**103 test mục tiêu khác nhau PASS**, gồm controller/projection/transport,
timeout + reload exact retry, stale/out-of-order, lifecycle, shared renderer,
keyboard/ARIA, touch Drag Online, Drag Offline, Solo, capture/effects và lobby.
Tái sử dụng phần đã PASS khi source tương ứng không đổi; không chạy full suite.

Log dưới `.local-qa/r5-02b/`:

- `targeted-01.log`: 30/30; phần client sau đó có thêm test JSONB.
- `ui-regression-01.log`: 59/59; browser client được thay bằng bản mở rộng.
- `transport.log`: 2/2; `canonical-regression.log`: 26/26;
  `browser-final-v3.log`: 14/14; `lobby-compat.log`: 8/8; `draw.log`: 1/1.
  Các lượt chạy chồng phạm vi không được cộng lặp vào tổng 103.
- Bốn viewport **390×844, 800×360, 844×390, 1366×768**: đủ 32 ô, tọa độ,
  không page scroll. Kiểm tra cả mock browser và live browser.
- Live cuối đúng source hash:
  `live-client-1795663729152.json`: **13/13 checks PASS** với hai Chrome profiles
  và đúng **2 Anonymous identities**. Hai ghế cùng board/player, chặn sai lượt,
  cả hai lật/đi/ăn qua UI, reload cả hai, offline/reconnect và viewport PASS.
  Vòng cuối chơi tiếp ván cũ từ version 19 đến **31**: mỗi bên 4 flip, 1 move,
  1 capture. Không gọi private DB, không sửa state hay tạo fixture live.
- Create/join/host-start thực đã thực hiện trong lần đầu bằng cùng hai profile.
  Phát hiện lỗi so sánh thứ tự JSON, sửa/test rồi resume đúng ván; không tạo
  lại tài khoản/phòng. Helper Chrome hỗ trợ reuse profile trong `.local-qa`
  và chờ DevTools port mới. Các log lỗi trước đó được giữ lại.
- Không có JS exception/console error/HTTP 404 trong cổng live cuối; có fetch
  bị hủy khi đổi lifecycle/reload và mô phỏng offline. `apiCalls` trong report
  là counter từ **lần reload cuối**, không phải tổng toàn bộ cuộc kiểm thử.
- Ván live version 31 **đang chơi, chưa kết thúc**, không coi là hòa. Kết quả
  thắng/hòa, cảnh báo và result-dialog được kiểm tra với public fixture ở QA
  browser, cùng bằng chứng engine/backend R5-02A đã có. Không lặp 97 nước chỉ
  để tăng số lượng; ván QA giữ trên server vì chưa có abandon endpoint.

Bằng chứng R5-02A **35/35 targeted, 58/58 live, 8/8 catalog** được giữ nguyên;
không chạy lại và không sửa backend. Baseline full regression vẫn **557/559**,
Drag recheck **11/11**; không tuyên bố full suite PASS. Không benchmark Bot.

## File và phát hành

Production: `js/online-match.mjs` mới; sửa `online-auth.mjs`, `online-lobby.mjs`,
`offline.mjs` và thêm quyền stop audio vào `effects.mjs`. Không đổi engine/Bot,
assets SVG/SFX, HTML/CSS desktop/mobile hay backend.
Tests: bốn file `client*.test.cjs`, `live-client.cjs`, helper Chrome/HTTP và
mock/nhãn của test lobby. Regex WIP `tests/rooms/public-smoke.cjs` không stage.

Sau push, Pages được đối chiếu commit và asset hashes; cùng hai danh tính QA
được đưa sang origin public **trong bộ nhớ/browser storage**, không ghi token
ra file/log. Preview phải khôi phục đúng hai ghế/version, URL thường không tải
Online. Kết quả public và SHA cuối lưu tại checkpoint/log ignored, báo cáo cuối.

Giới hạn: chưa abandon/resign/timeout tự động hoặc ván Online tiếp theo; không
heartbeat/Realtime/private subscriptions. Kiểm tra Chrome tự động/emulation,
chưa kiểm trên điện thoại thật hay Safari. Online chưa mở ở URL thường.
