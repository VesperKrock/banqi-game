# Banqi Game

Web cờ tướng lật (Banqi / Chinese Dark Chess), ưu tiên đơn giản, hiệu quả và công bằng.

**R2-01: Offline · Hai người cùng máy.** Đã nối engine R1 vào UI: tạo ván, lật/phân màu, chọn/đi/ăn, thắng/thua và hòa tự động. Giữ tọa độ a1–h4, Ngang/Dọc và Sáng/Tối có lưu lựa chọn. Chưa có Online, Bot hoặc SVG.

## Mở trò chơi qua HTTP

Trong VS Code, dùng **Open with Live Server** trên `index.html`, rồi mở địa chỉ được cung cấp, thường là `http://127.0.0.1:5500/index.html`. Bật JavaScript. Có thể dùng local HTTP server tĩnh tương đương; không cần backend/API, framework, npm dependency hoặc build.

R2-01 import `js/engine.mjs` qua ES module. **Không mở bằng cách double-click `file://`** vì trình duyệt thường chặn module import qua CORS. Các đường dẫn tài nguyên đều tương đối, phù hợp hosting dưới thư mục như GitHub Pages; chưa push/deploy.

## Cách chơi

- Ván mới có 32 quân úp; engine chọn ngẫu nhiên Người 1 hoặc Người 2 lật trước. Người lật đầu nhận màu quân vừa mở. Nhãn phía trên luôn ghi lượt và màu của mỗi người.
- Click/tap quân úp để lật đúng một quân và kết thúc lượt; có thể lật ra quân của đối phương.
- Chọn quân đã mở của người đến lượt. Ô có dấu **·** là đích đi; viền nét đứt là đích ăn. Bấm đích hợp lệ để thực hiện. Bấm lại quân để bỏ chọn, bấm quân mình khác để đổi chọn; vẫn có thể lật quân úp khi đang chọn.
- Nước không hợp lệ chỉ hiện một phản hồi ngắn, không đổi lượt/bàn. Các luật Pháo, Tốt/Tướng và thứ bậc do engine quyết định; xem `docs/RULES.md`.
- Engine tự kết thúc khi đối phương hết quân/hết hành động, lặp thế cờ lần thứ ba hoặc 60 nửa-lượt không lật/ăn. UI hiện người thắng/hòa cùng lý do và khóa thao tác trên bàn.
- **Ván mới** hỏi xác nhận khi bỏ ván đang chơi đã có nước. Hủy giữ ván; đồng ý xáo lại, bỏ phân màu/lựa chọn. Ván đã kết thúc có thể bắt đầu lại ngay. Hướng và theme vẫn giữ.
- Dùng Tab tới ô, Enter hoặc Space để lật/chọn/đi/ăn. Quân úp có nhãn `Quân úp tại a1`, không đọc danh tính thật.
- Ván chỉ nằm trong bộ nhớ của trang; tải lại/đóng trang sẽ mất ván. Chưa có lưu ván, undo, replay, đồng hồ hoặc chịu thua/xin hòa.

## Hướng bàn và theme

- **Ngang:** 8 cột × 4 hàng; góc trên trái a4, trên phải h4, dưới trái a1, dưới phải h1. Trục a–h ở dưới, 4–1 bên trái.
- **Dọc:** 4 cột × 8 hàng, xoay vị trí 90° theo kim đồng hồ; hàng đầu a1 a2 a3 a4, hàng cuối h1 h2 h3 h4. Trục 1–4 ở dưới, a–h bên trái. Chữ và quân luôn thẳng.
- Nhãn trục nằm ngoài bàn. Rê chuột lên ô để xem tọa độ; ô cũng có thể nhận focus bằng Tab và có tên truy cập cho trình đọc màn hình. ID/tọa độ của ô luôn giữ nguyên.
- **Sáng / Tối:** lần đầu theo hệ thống; chọn bằng nút để lưu trong `localStorage` (khóa `banqi-theme`). Lần mở lại ưu tiên lựa chọn đã lưu. Khi chưa chọn thủ công, giao diện theo thay đổi theme hệ thống.
- Nếu storage bị chặn, nút đổi theme vẫn hoạt động trong lần mở hiện tại. Lưu trữ gắn với trình duyệt/vị trí trang; không đồng bộ giữa thiết bị. Đổi theme/hướng không đổi quân, lượt, kết quả hay quân đang chọn. Dấu ✓ chỉ rõ nút đang chọn.
- Trên màn hình hẹp, Dọc cho ô lớn hơn; cuộn dọc khi cần. Không xoay chữ/quân, không có animation trang trí.

## Unicode và dữ liệu công khai

| Loại | Tướng | Sĩ | Tượng | Xe | Mã | Pháo | Tốt |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Đỏ | 帥 | 仕 | 相 | 俥 | 傌 | 炮 | 兵 |
| Đen | 將 | 士 | 象 | 車 | 馬 | 砲 | 卒 |

Quân tròn bằng CSS, Đỏ viền kép, Đen viền đơn, cùng ký tự khác nhau và bảng màu tương phản cho cả hai theme. Quân úp dùng `?` trung tính. Một phần tử `.piece` trong mỗi ô dành cho việc thay hình sau này ở `assets/pieces/red/`, `assets/pieces/black/`, `assets/pieces/back.svg`; R2-01 chưa tạo/tải SVG.

`js/offline.mjs` sở hữu private state trong phạm vi module, không gắn lên `window`, DOM hoặc log. Render và phản hồi chỉ dùng `getPublicState`/event công khai; chọn đích bằng `getLegalActions`, thực thi bằng `applyAction`. Không sao chép luật vào UI, không đổi engine R1. **Offline không ngăn người dùng cố tình soi bộ nhớ bằng DevTools**; Online tương lai phải giữ private state ở backend.

## Cấu trúc

```text
index.html               Trang Offline tiếng Việt, mở qua HTTP
style.css                Giao diện PC và điện thoại
js/app.js                32 nút ô ổn định, tọa độ/ánh xạ và theme trước khi vẽ trang
js/offline.mjs           Controller Offline, giữ private state và render public
js/engine.mjs            Engine thuần: lật/đi/ăn, thắng/thua/hòa
docs/SPEC.md             Quyết định sản phẩm, phạm vi và việc chưa làm
docs/RULES.md            Hợp đồng API và luật R1
assets/pieces/red/       Chỗ cho SVG quân đỏ về sau
assets/pieces/black/     Chỗ cho SVG quân đen về sau
prompts/                 Prompt triển khai được giữ nguyên
tests/mapping.test.cjs   Kiểm thử ánh xạ, không có dependency
tests/browser.test.cjs   Kiểm thử UI/theme bằng Chrome có sẵn
tests/gameplay.test.cjs  Gameplay, bảo mật DOM, Unicode và responsive
tests/engine.test.cjs    Luật lật/đi/ăn và ranh giới public/private
tests/endgame.test.cjs   Thắng/thua, hòa và khóa ván
tests/helpers/chrome.cjs Kết nối Chrome để chạy test, không có dependency
tests/helpers/http.cjs   HTTP server chỉ dùng cho test, route allowlist/fixture
.gitignore              Bỏ qua môi trường, mật khẩu và dữ liệu local
```

## Kiểm thử

Kiểm thử luật và tọa độ bằng Node tích hợp:

```text
node --test tests/engine.test.cjs tests/endgame.test.cjs tests/mapping.test.cjs
```

148 test: 102 luật/công bằng R1-01, 36 kết thúc ván R1-02, 10 ánh xạ R0. Engine và các test này giữ nguyên trong R2-01.

Nếu có Node 22+ và Chrome cài sẵn, chạy toàn bộ test:

```text
node --test --test-reporter=spec tests/engine.test.cjs tests/endgame.test.cjs tests/mapping.test.cjs tests/browser.test.cjs tests/gameplay.test.cjs
node --check js/app.js
node --check js/offline.mjs
node --check js/engine.mjs
git diff --check
```

Test trình duyệt tự mở HTTP server trên `127.0.0.1` với cổng trống và Chrome headless với profile riêng, rồi đóng server/tiến trình do test tạo. Không cần khởi động server thủ công hoặc cài package. Nếu Chrome ở vị trí khác, đặt biến môi trường `CHROME_PATH` tới executable. Thiếu Chrome sẽ báo lỗi, không tự cài đặt hoặc tự tuyên bố PASS.

Tổng **213 test** tính cả hai test cha browser: 175 hồi quy + 38 gameplay. Không xóa/vô hiệu test nền. Test R0 được chuyển từ `file://` sang HTTP, cập nhật nhãn quân úp và semantic button. Trong test 100 vòng đổi hướng/theme, bỏ kỳ vọng cũ “bấm ô không làm gì”; hành vi click-lật một quân được kiểm tra trong suite gameplay, cùng các kiểm tra kích thước/tròn mới.

37 kịch bản gameplay (38 tính test cha) kiểm tra phân màu cả hai người/hai màu, chọn/bỏ/đổi chọn, đi/ăn, invalid không spam, Pháo và Tốt/Tướng, cả bốn kết thúc thật, confirm thật, Tab/Enter/Space, chuột/touch giả lập và một ván đủ 32 quân đến thắng sau 83 hành động. Fixture chỉ thay khởi tạo ở HTTP server của test; mọi hành động/kết quả vẫn qua engine thật, không thêm backdoor vào production.

Cả suite hồi quy và gameplay đều kiểm tra **320×568, 390×844, 768×1024, 1280×800 × hai theme × hai hướng**, không overflow/lỗi console/network. Gameplay đo độ tròn, kích thước mặt quân/chữ, hai kiểu viền, tương phản và đích đi/ăn. Ảnh, `report.json` và profile nằm trong `.local-qa/r2-01/regression/` và `.local-qa/r2-01/gameplay/`, được Git bỏ qua. Không xóa bộ ảnh QA cũ.

Kiểm tra thủ công trong trình duyệt:

1. Mở bằng Live Server: có 32 dấu `?`, lượt Người 1/2, chưa phân màu. Lật quân đầu và kiểm tra màu/lượt đổi đúng.
2. Chọn quân, đi/ăn hoặc lật tiếp. Thử ô sai: lượt/quân không đổi. Bấm lại bỏ chọn; thử Tab/Enter/Space và tap.
3. Đổi Ngang/Dọc, Sáng/Tối giữa ván: quân/lượt/lựa chọn không đổi, ký tự thẳng, trục không chồng bàn. Kiểm tra cả bốn kích thước trên; bàn dọc có thể cần cuộn trang.
4. Ván mới: hủy giữ ván, xác nhận reset. Chọn theme rồi tải lại: theme giữ, ván bắt đầu lại.
5. Chơi đến kết thúc: đúng thông báo thắng/hòa và lý do, bàn không nhận thêm nước.

Đã kiểm tra tự động Chrome và xem ảnh PC/mobile giả lập. Chưa thử điện thoại thật, Safari/Firefox hoặc trình đọc màn hình thật; cây accessibility được kiểm tra qua Chrome. Unicode phụ thuộc font có trên thiết bị.

## Phạm vi tiếp theo

Đánh giá/trải nghiệm Offline thực tế rồi mới hoàn thiện UI/SVG. Chưa bắt đầu R2-02, Online, Bot, backend/Supabase, âm thanh hoặc animation. Checkpoint R0–R1: `663b03b`; phần R2-01 để trên working tree, không commit thêm/push/deploy. Không đưa secret, prompt bị ignore hoặc ảnh QA vào Git.
