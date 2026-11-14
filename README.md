# Banqi Game

Web cờ tướng lật (Banqi / Chinese Dark Chess), ưu tiên đơn giản, hiệu quả và công bằng.

**R2-04: Offline · Hai người cùng máy, dùng đủ 15 SVG và có Unicode dự phòng.** Giữ engine R2-03C để tạo ván, lật/phân màu, đi/ăn, xử thắng/hòa và lỗi trường tróc. Cảnh báo hiện trước nước vi phạm; giữ tọa độ a1–h4, Ngang/Dọc và Sáng/Tối có lưu lựa chọn. Chưa có Online, Bot hoặc âm thanh.

## Mở trò chơi qua HTTP

Trong VS Code, dùng **Open with Live Server** trên `index.html`, rồi mở địa chỉ được cung cấp, thường là `http://127.0.0.1:5500/index.html`. Bật JavaScript. Có thể dùng local HTTP server tĩnh tương đương; không cần backend/API, framework, npm dependency hoặc build.

R2-01 import `js/engine.mjs` qua ES module. **Không mở bằng cách double-click `file://`** vì trình duyệt thường chặn module import qua CORS. Các đường dẫn tài nguyên đều tương đối, phù hợp hosting dưới thư mục như GitHub Pages; chưa push/deploy.

## Cách chơi

- Ván mới có 32 quân úp cùng hình mặt sau `back.svg`; engine chọn ngẫu nhiên Người 1 hoặc Người 2 lật trước. Người lật đầu nhận màu quân vừa mở. Nhãn phía trên luôn ghi lượt và màu của mỗi người.
- Click/tap quân úp để lật đúng một quân và kết thúc lượt; có thể lật ra quân của đối phương.
- Chọn quân đã mở của người đến lượt. Ô có dấu **·** là đích đi; viền nét đứt là đích ăn. Bấm đích hợp lệ để thực hiện. Bấm lại quân để bỏ chọn, bấm quân mình khác để đổi chọn; vẫn có thể lật quân úp khi đang chọn.
- Nước không hợp lệ chỉ hiện một phản hồi ngắn, không đổi lượt/bàn. Các luật Pháo, Tốt/Tướng và thứ bậc do engine quyết định; xem `docs/RULES.md`.
- Engine xét hết quân/hết hành động, lặp ba lần, 60 nửa-lượt không lật/ăn và lỗi trường tróc. Khi hòa bị hoãn do truy đuổi, UI nói rõ “Chưa hòa”; khi kết thúc, hiện thắng/hòa cùng lý do và khóa bàn.
- **Ván mới** hỏi xác nhận khi bỏ ván đang chơi đã có nước. Hủy giữ ván; đồng ý xáo lại, bỏ phân màu/lựa chọn. Ván đã kết thúc có thể bắt đầu lại ngay. Hướng và theme vẫn giữ.
- Dùng Tab tới ô, Enter hoặc Space để lật/chọn/đi/ăn. Quân úp có nhãn `Quân úp tại a1`, không đọc danh tính thật.
- Ván chỉ nằm trong bộ nhớ của trang; tải lại/đóng trang sẽ mất ván. Chưa có lưu ván, undo, replay, đồng hồ hoặc chịu thua/xin hòa.

## Cảnh báo trường tróc

- Khu vực riêng cạnh lượt nhắc khi đuổi cùng quân **5/6** hoặc **6/6**. Khi tới lượt, các nước sẽ phạm lỗi được ghi rõ, ví dụ **b2–c2: lỗi 1/2 cho Người 1 (Đỏ)**.
- Chọn quân: đích có rủi ro mang dấu **!**, viền cảnh báo và mô tả truy cập về nước đi/hậu quả. Dấu hiện trước click/tap/Enter/Space; không cần hover. Đổi/bỏ chọn xóa dấu của quân cũ; nước được cảnh báo vẫn có thể thực hiện.
- Lỗi đầu: giữ nước, chuyển lượt, thông báo **lỗi trường tróc 1/2 — ván tiếp tục**. Nếu nước cụ thể tiếp theo sẽ phạm lỗi thứ hai, cảnh báo ghi rõ **lỗi 2/2 và xử thua**. Kết thúc nêu cả người/màu thắng và thua, với nguyên nhân hai lỗi trường tróc.
- Hoãn hòa lặp nêu bên liên tục đuổi; hoãn 60 nêu số nửa-lượt thật, bên/cặp quân bị ràng buộc. Đây là thông tin từ engine; UI không tự đếm hoặc xử luật. Quy ước 7/2 và ngoại lệ là house adjudication của game, xem [RULES.md](docs/RULES.md).
- Thông báo chọn quân/nước đi không ghi đè cảnh báo. Vùng `aria-live="polite"` chỉ đổi khi nội dung đổi; theme/hướng không đọc lại cùng cảnh báo. Invalid không tạo lỗi; Ván mới xóa mọi thông tin của ván cũ.

## Hướng bàn và theme

- **Ngang:** 8 cột × 4 hàng; góc trên trái a4, trên phải h4, dưới trái a1, dưới phải h1. Trục a–h ở dưới, 4–1 bên trái.
- **Dọc:** 4 cột × 8 hàng, xoay vị trí 90° theo kim đồng hồ; hàng đầu a1 a2 a3 a4, hàng cuối h1 h2 h3 h4. Trục 1–4 ở dưới, a–h bên trái. Chữ và quân luôn thẳng.
- Nhãn trục nằm ngoài bàn. Rê chuột lên ô để xem tọa độ; ô cũng có thể nhận focus bằng Tab và có tên truy cập cho trình đọc màn hình. ID/tọa độ của ô luôn giữ nguyên.
- **Sáng / Tối:** lần đầu theo hệ thống; chọn bằng nút để lưu trong `localStorage` (khóa `banqi-theme`). Lần mở lại ưu tiên lựa chọn đã lưu. Khi chưa chọn thủ công, giao diện theo thay đổi theme hệ thống.
- Nếu storage bị chặn, nút đổi theme vẫn hoạt động trong lần mở hiện tại. Lưu trữ gắn với trình duyệt/vị trí trang; không đồng bộ giữa thiết bị. Đổi theme/hướng không đổi quân, lượt, kết quả hay quân đang chọn. Dấu ✓ chỉ rõ nút đang chọn.
- Trên màn hình hẹp, Dọc cho ô lớn hơn; cuộn dọc khi cần. Không xoay chữ/quân, không có animation trang trí.

## Bộ quân SVG, fallback và dữ liệu công khai

Đã kiểm đủ **15/15 asset** trong bảng dưới. Mỗi quân đã lật chọn ảnh theo color/type công khai; mọi quân úp dùng chung một URL, không phụ thuộc danh tính thật.

| Type | SVG Đỏ / chữ dự phòng | SVG Đen / chữ dự phòng |
| --- | --- | --- |
| `general` — Tướng | [red/general.svg](assets/pieces/red/general.svg) / 帥 | [black/general.svg](assets/pieces/black/general.svg) / 將 |
| `advisor` — Sĩ | [red/advisor.svg](assets/pieces/red/advisor.svg) / 仕 | [black/advisor.svg](assets/pieces/black/advisor.svg) / 士 |
| `elephant` — Tượng | [red/elephant.svg](assets/pieces/red/elephant.svg) / 相 | [black/elephant.svg](assets/pieces/black/elephant.svg) / 象 |
| `rook` — Xe | [red/rook.svg](assets/pieces/red/rook.svg) / 俥 | [black/rook.svg](assets/pieces/black/rook.svg) / 車 |
| `horse` — Mã | [red/horse.svg](assets/pieces/red/horse.svg) / 傌 | [black/horse.svg](assets/pieces/black/horse.svg) / 馬 |
| `cannon` — Pháo | [red/cannon.svg](assets/pieces/red/cannon.svg) / 炮 | [black/cannon.svg](assets/pieces/black/cannon.svg) / 砲 |
| `pawn` — Tốt | [red/pawn.svg](assets/pieces/red/pawn.svg) / 兵 | [black/pawn.svg](assets/pieces/black/pawn.svg) / 卒 |
| Mặt úp chung | [back.svg](assets/pieces/back.svg) / `?` | Cùng `back.svg` / `?` |

Ảnh là vector thực, canvas `256×256`, chữ Hán đã chuyển thành đường path. Kiểm tra XML và Chrome xác nhận không script, handler `on*`, foreignObject, ảnh raster/base64, font nhúng hay tham chiếu tài nguyên ngoài; các tham chiếu màu/clip/glyph đều nội bộ. Render bằng `<img alt="" aria-hidden="true">`, không chèn nội dung SVG qua `innerHTML`; nhãn tiếng Việt nằm trên nút ô. Đường dẫn tương đối đã kiểm tra cả khi phục vụ dưới `/banqi/`.

Khi đang tải hoặc ảnh thiếu/lỗi decode, ô giữ ký tự Unicode đúng ở bảng trên, mặt úp là `?`; ảnh hỏng không hiện biểu tượng vỡ. Chọn/bỏ chọn hoặc đổi theme/hướng không tạo vòng tải lại URL lỗi. Khi ảnh tải được, Unicode dự phòng được ẩn. CSS giữ toàn bộ canvas và bóng có sẵn, không thêm viền/bóng kép; ảnh không xoay hoặc cản mouse/touch/focus, dấu `!` vẫn ở trên lớp quân.

Theo [README tài nguyên](assets/pieces/ASSET_README.md), outline chữ lấy từ **Noto Serif CJK TC Bold**, có [SIL OFL 1.1 và thông tin copyright đi kèm](assets/pieces/FONT_LICENSE_OFL.txt). Giữ nguyên hai tài liệu này và toàn bộ 15 SVG; không nhúng hoặc phân phối file font. ZIP nguồn được giữ nguyên, ứng dụng dùng trực tiếp các file đã chuẩn hóa trong `assets/pieces/`.

`js/offline.mjs` sở hữu private state trong phạm vi module, không gắn lên `window`, DOM hoặc log. Render và phản hồi chỉ dùng `getPublicState`/event công khai, gồm `chase.faults/runs/drawDeferred/warnings`; chọn đích bằng `getLegalActions`, thực thi bằng `applyAction`. R2-04 chỉ đổi lớp hiển thị, giữ nguyên engine/schema/luật R2-03C. DOM, URL, alt/title/class và nhãn quân úp đều không chứa màu/type thật. **Offline không ngăn người dùng cố tình soi bộ nhớ bằng DevTools**; Online tương lai phải giữ private state ở backend.

## Cấu trúc

```text
index.html               Trang Offline tiếng Việt, mở qua HTTP
style.css                Giao diện PC và điện thoại
js/app.js                32 nút ô ổn định, tọa độ/ánh xạ và theme trước khi vẽ trang
js/offline.mjs           Controller Offline, giữ private state và render public
js/engine.mjs            Engine thuần: lật/đi/ăn, thắng/thua/hòa và trường tróc
docs/SPEC.md             Quyết định sản phẩm, phạm vi và việc chưa làm
docs/RULES.md            Hợp đồng API và luật đến R2-03C
docs/CHASE_RULE_DESIGN.md Nguồn/house rule và kiểm chứng trường tróc
assets/pieces/red/       7 SVG quân đỏ
assets/pieces/black/     7 SVG quân đen
assets/pieces/back.svg   Mặt úp chung
assets/pieces/ASSET_README.md      Nguồn tài nguyên và attribution
assets/pieces/FONT_LICENSE_OFL.txt Giấy phép outline font đi kèm
prompts/                 Prompt triển khai được giữ nguyên
tests/mapping.test.cjs   Kiểm thử ánh xạ, không có dependency
tests/browser.test.cjs   Kiểm thử UI/theme bằng Chrome có sẵn
tests/gameplay.test.cjs  Gameplay, bảo mật DOM, SVG/fallback và responsive
tests/svg.test.cjs       15 asset vector, mapping, kích thước nhỏ và lỗi tải
tests/engine.test.cjs    Luật lật/đi/ăn và ranh giới public/private
tests/endgame.test.cjs   Thắng/thua, hòa và khóa ván
tests/chase.test.cjs     Trường tróc, tương tác hòa, công bằng thông tin
tests/helpers/chrome.cjs Kết nối Chrome để chạy test, không có dependency
tests/helpers/http.cjs   HTTP server chỉ dùng cho test, route allowlist/fixture
.gitignore              Bỏ qua môi trường, mật khẩu và dữ liệu local
```

## Kiểm thử

Kiểm thử luật và tọa độ bằng Node tích hợp:

```text
node --test tests/engine.test.cjs tests/endgame.test.cjs tests/chase.test.cjs tests/mapping.test.cjs
```

217 unit test: 102 luật/công bằng, 36 kết thúc ván, 69 trường tróc, 10 ánh xạ. Engine và bốn suite này giữ nguyên trong R2-04.

Nếu có Node 22+ và Chrome cài sẵn, chạy toàn bộ test:

```text
node --test --test-reporter=spec tests/engine.test.cjs tests/endgame.test.cjs tests/chase.test.cjs tests/mapping.test.cjs tests/browser.test.cjs tests/gameplay.test.cjs tests/svg.test.cjs
node --check js/app.js
node --check js/offline.mjs
node --check js/engine.mjs
node --check tests/gameplay.test.cjs
node --check tests/browser.test.cjs
node --check tests/svg.test.cjs
node --check tests/helpers/chrome.cjs
node --check tests/helpers/http.cjs
git diff --check
```

Test trình duyệt tự mở HTTP server trên `127.0.0.1` với cổng trống và Chrome headless với profile riêng, rồi đóng server/tiến trình do test tạo. Không cần khởi động server thủ công hoặc cài package. Nếu Chrome ở vị trí khác, đặt biến môi trường `CHROME_PATH` tới executable. Thiếu Chrome sẽ báo lỗi, không tự cài đặt hoặc tự tuyên bố PASS.

R2-03B giữ toàn bộ **265 test nền** (213 R2-01 + 52 R2-03A), thêm **8 ca UI** vào suite gameplay: tổng **273 test** tính cả hai test cha browser. Không xóa/skip/nới assertion nền hoặc đổi engine/unit test. Những điều chỉnh từ placeholder sang gameplay ở R2-01 vẫn được giữ.

R2-03C thêm 17 ca để đạt **290/290**. R2-04 đã chạy lại baseline 290 trước checkpoint, giữ tất cả ca đó và thêm **22 test**: 1 manifest/giấy phép, 15 asset XML/vector/render, 5 kịch bản mapping/fallback/kích thước/phục hồi và 1 test cha Chrome. Tổng **312/312 PASS**, 0 fail/skip; gồm 218 Node và 94 Chrome tính cả ba test cha. Chỉ cập nhật assertion trình bày Unicode thành kiểm tra SVG đã decode và fallback, đồng thời chờ ảnh tải bất đồng bộ; không thay kỳ vọng luật/kết quả. `node --check` toàn bộ 12 file JS/MJS/CJS trong `js/` và `tests/`, `git diff --check` PASS.

45 kịch bản gameplay (46 tính test cha) giữ các kiểm tra phân màu, đi/ăn, Pháo/Tốt/Tướng, bốn kết thúc cũ, confirm, input và ván đủ 32 quân kết thúc sau 83 hành động. Ca mới chạy C1 qua UI đủ 27 ply: ply 8 chưa hòa, chuột thực hiện lỗi đầu tại 13, touch thực hiện lỗi thứ hai tại 27; Tab/Enter/Space đọc đúng đích trước khi đi. Có kiểm tra nhiều warning/đổi chọn, invalid, nước không bị cảnh báo, hoãn 60, ván mới, DOM/label/event/log công khai và bố cục khi đang warning lỗi thứ hai. Fixture chỉ thay lần khởi tạo đầu ở HTTP server test; mọi hành động/kết quả qua engine thật, không có backdoor production.

Cả suite hồi quy và gameplay đều kiểm tra **320×568, 390×844, 768×1024, 1280×800 × hai theme × hai hướng**, không overflow/lỗi console/network ở tải bình thường. Ca warning cũng chạy đủ 16 tổ hợp, kiểm tra chữ/dấu ! không bị che, tương phản ≥4.5, focus, quân tròn và tọa độ. Test SVG parse XML, decode và kiểm tra pixel thật của từng ảnh; giả lập riêng HTTP 404/decode lỗi cho cả 15 URL, kiểm tra Unicode và không retry. Các 404 cố ý được xác nhận theo đúng URL và ghi riêng, không bỏ qua lỗi ngoài fixture. Helper HTTP chỉ mở allowlist source/15 SVG; không có endpoint thử lỗi trong production.

Ảnh, `report.json` và profile nằm trong thư mục `run-*` mới dưới `.local-qa/r2-01/regression/`, `gameplay/` và `svg/`, được Git bỏ qua. Không xóa/ghi đè bằng chứng QA cũ. Đã tự xem 12 ảnh gameplay tại 320/390/1280 ở cả hai theme/hướng, ảnh cảnh báo/fallback và bảng đủ 15 quân ở **40/50/60 px** trên nền sáng/tối. Phân biệt được Đỏ, Đen, mặt úp; nét chữ/viền/bóng không bị cắt. Bàn ngang 320 px có quân nhỏ hơn 40 px để giữ đủ 8 cột; hướng Dọc cho quân lớn hơn.

Kiểm tra thủ công trong trình duyệt:

1. Mở bằng Live Server: có 32 hình mặt úp chung, lượt Người 1/2, chưa phân màu. Lật quân đầu và kiểm tra SVG đúng quân, màu/lượt đổi đúng.
2. Chọn quân, đi/ăn hoặc lật tiếp. Thử ô sai: lượt/quân không đổi. Bấm lại bỏ chọn; thử Tab/Enter/Space và tap.
3. Đổi Ngang/Dọc, Sáng/Tối giữa ván: quân/lượt/lựa chọn không đổi, ký tự thẳng, trục không chồng bàn. Kiểm tra cả bốn kích thước trên; bàn dọc có thể cần cuộn trang.
4. Ván mới: hủy giữ ván, xác nhận reset. Chọn theme rồi tải lại: theme giữ, ván bắt đầu lại.
5. Chơi đến kết thúc: đúng thông báo thắng/hòa và lý do, bàn không nhận thêm nước.
6. Khi có nhắc 5/6–6/6, chọn quân để đọc nước cảnh báo và dấu ! trước khi đi. Lỗi đầu vẫn chơi; lỗi thứ hai hiển thị người/màu thắng–thua. Thử đổi hướng/theme, bỏ chọn và Ván mới trong các trạng thái này.

Đã kiểm tra tự động Chrome và xem ảnh PC/mobile giả lập. Chưa thử điện thoại thật, Safari/Firefox hoặc trình đọc màn hình thật; cây accessibility được kiểm tra qua Chrome. SVG không phụ thuộc font trên thiết bị; chỉ Unicode dự phòng phụ thuộc font sẵn có.

## Phạm vi tiếp theo

**Bước tiếp theo duy nhất: chủ dự án nghiệm thu bộ quân SVG trong Offline, sau đó mới làm âm thanh/UX.** Chưa làm Online, Bot, backend/Supabase, âm thanh hoặc animation. Checkpoint R0–R1: `663b03b`; R2-01: `d0509c3`; R2-02/R2-03A: `8edc566`; checkpoint R2-03B/C: **`b7a4d322cb2d7c10b7dc9d9a7699177b8ea1587b`**, đúng 13 file source/test/docs sau baseline 290/290. Không ZIP/asset mới/prompt/QA/secret trong commit. Phần tích hợp R2-04 và tài nguyên vẫn trên working tree, không stage/commit thêm/push/deploy. Chi tiết nghiệm thu và danh sách file ở [SPEC.md](docs/SPEC.md#r2-04--checkpoint-và-bộ-quân-svg-offline).
