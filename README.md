# Banqi Game

Web cờ tướng lật (Banqi / Chinese Dark Chess), ưu tiên đơn giản, hiệu quả và công bằng.

**R0-02: Bản khung — chưa chơi được.** Giữ 32 ô úp và nút Ngang/Dọc của R0-01; bổ sung tọa độ a1–h4 ngoài mép bàn, giao diện Sáng/Tối có lưu lựa chọn. Chưa có luật chơi, lật/đi/ăn quân, Online hoặc Bot.

## Mở bản khung

Mở trực tiếp `index.html` bằng trình duyệt có bật JavaScript. Không cần server, Node/npm, cài package hay build. CSS và script dùng đường dẫn tương đối để phù hợp GitHub Pages sau này; R0-01 chưa triển khai hosting.

- **Ngang:** 8 cột × 4 hàng; góc trên trái a4, trên phải h4, dưới trái a1, dưới phải h1. Trục a–h ở dưới, 4–1 bên trái.
- **Dọc:** 4 cột × 8 hàng, xoay vị trí 90° theo kim đồng hồ; hàng đầu a1 a2 a3 a4, hàng cuối h1 h2 h3 h4. Trục 1–4 ở dưới, a–h bên trái. Chữ và quân luôn thẳng.
- Nhãn trục nằm ngoài bàn. Rê chuột lên ô để xem tọa độ; ô cũng có thể nhận focus bằng Tab và có tên truy cập cho trình đọc màn hình. ID/tọa độ của ô luôn giữ nguyên.
- **Sáng / Tối:** lần đầu theo hệ thống; chọn bằng nút để lưu trong `localStorage` (khóa `banqi-theme`). Lần mở lại ưu tiên lựa chọn đã lưu. Khi chưa chọn thủ công, giao diện theo thay đổi theme hệ thống.
- Nếu storage bị chặn, nút đổi theme vẫn hoạt động trong lần mở hiện tại. Lưu trữ gắn với trình duyệt/vị trí trang; không đồng bộ giữa thiết bị. Đổi theme không đổi hướng bàn, dữ liệu ô hoặc focus. Dấu ✓ chỉ rõ nút đang chọn.

## Cấu trúc

```text
index.html               Trang tiếng Việt, mở trực tiếp
style.css                Giao diện PC và điện thoại
js/app.js                32 placeholder, tọa độ/ánh xạ và lựa chọn theme
docs/SPEC.md             Quyết định sản phẩm, phạm vi và việc chưa làm
assets/pieces/red/       Chỗ cho SVG quân đỏ về sau
assets/pieces/black/     Chỗ cho SVG quân đen về sau
prompts/                 Prompt triển khai được giữ nguyên
tests/mapping.test.cjs   Kiểm thử ánh xạ, không có dependency
tests/browser.test.cjs   Kiểm thử UI/theme bằng Chrome có sẵn
tests/helpers/chrome.cjs Kết nối Chrome để chạy test, không có dependency
.gitignore              Bỏ qua môi trường, mật khẩu và dữ liệu local
```

## Kiểm thử

Nếu máy đã có Node.js hỗ trợ `node:test` (đã chạy với Node 22), kiểm thử tự động bằng:

```text
node --test tests/mapping.test.cjs
```

10 test kiểm tra đủ 32 vị trí/nhãn, giới hạn tọa độ, ánh xạ nghịch đảo, bốn góc, quan hệ kề và 100 vòng chuyển hướng. Các kiểm tra R0-01 được giữ, cập nhật kỳ vọng vị trí theo quy ước R0-02. Node chỉ phục vụ kiểm thử tùy chọn; không cần để mở trang.

Nếu có Node 22+ và Chrome cài sẵn, chạy toàn bộ test:

```text
node --test tests/mapping.test.cjs tests/browser.test.cjs
node --check js/app.js
git diff --check
```

Test trình duyệt tự mở Chrome headless với profile riêng, tải `index.html` qua `file://`, rồi đóng tiến trình do test tạo. Không cần server hoặc package. Nếu Chrome ở vị trí khác, đặt biến môi trường `CHROME_PATH` tới executable. Thiếu Chrome sẽ báo lỗi, không tự cài đặt hoặc tự tuyên bố PASS.

26 kịch bản Chrome kiểm tra theme hệ thống, lưu/mở lại, storage bị chặn, CSS khi tắt JavaScript, tương phản, bàn phím, cây accessibility, chuột/cảm ứng giả lập và 16 tổ hợp: 4 kích thước × 2 theme × 2 hướng. Ảnh chụp, báo cáo `report.json` và profile kiểm thử nằm trong `.local-qa/r0-02/`, được Git bỏ qua. Node báo 27 test trình duyệt khi tính cả test cha bao 26 kịch bản.

Kiểm tra thủ công trong trình duyệt:

1. Mở `index.html`: có thông báo chưa chơi được và đúng 32 dấu `?`.
2. Bấm Dọc rồi Ngang: đối chiếu các góc/hàng và trục mô tả ở trên; chữ/quân vẫn thẳng, không có nhãn debug dưới quân. Lặp lại nhiều lần; ID `cell-0` đến `cell-31` không mất hoặc trùng.
3. Kiểm tra cả hai hướng và Sáng/Tối tại 320×568, 390×844, 768×1024, 1280×800: không tràn ngang; nhãn trục rõ, không đè lên quân. Bàn dọc có thể cần cuộn trang theo chiều dọc.
4. Chọn theme rồi tải lại trang; lựa chọn được giữ. Trong profile mới chưa chọn thủ công, theme theo hệ thống. Khi storage bị chặn, nút vẫn đổi được theme.
5. Dùng Tab rồi Enter/Space đổi hướng/theme; focus rõ, không nhảy bất ngờ. Tab tới ô: có nhãn truy cập a1–h4. Bấm ô không làm lật, đi hoặc ăn quân; Console không có lỗi.

Các bước trên là hướng dẫn kiểm tra, không phải tuyên bố đã kiểm tra thủ công trên thiết bị thật.

## Phạm vi tiếp theo

Xem `docs/SPEC.md` trước khi làm R1 (engine luật). Lộ trình: Offline hai người → Online hai người → một Bot mạnh, công bằng. R0 không tạo backend/Supabase, SQL, khóa API, dependency hoặc GitHub Actions; không commit/push/deploy. Không đưa mật khẩu, secret hoặc file môi trường local vào Git.
