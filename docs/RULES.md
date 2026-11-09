# R1-01 / R1-02 — Luật và API engine Banqi

Trạng thái: `js/engine.mjs` có luật lật/đi/ăn, thắng do hết quân/hết hành động và hòa tự động theo quy ước sản phẩm. **Chưa nối vào UI R0-02**, chưa có gameplay trên trang. Phạm vi theo `prompts/R1-01-engine-banqi.md` và `prompts/R1-02-ket-thuc-hoa-banqi.md`; không gồm Online, Bot, xin hòa/chịu thua hoặc đồng hồ.

## Nguồn và lựa chọn biến thể

Đã đối chiếu **Rules for Chinese Dark Chess**, Tsan-sheng Hsu, ngày 19/12/2008: [PDF theo đường dẫn trong prompt](https://homepage.iis.sinica.edu.tw/~tshsu/tcg/2011/hwks/rules.pdf), [bản trên cùng website ở thư mục 2008](https://homepage.iis.sinica.edu.tw/~tshsu/tcg/2008/hwks/rules.pdf). Hai file tải về có cùng 96.435 byte và SHA-256 `a623624995e34478bcb8a4e3f915324d20221097ca948a1496ee392e2aa86274`. Công cụ đọc web không mở được đường dẫn 2011; đã tải và so sánh hash với bản 2008 đọc được.

PDF xác nhận thứ bậc, ngoại lệ Tốt/Tướng và Pháo phải có đúng một ngòi để nhảy ăn; ngòi có thể úp hoặc lật, không phân biệt màu. Không ghép luật cờ tướng truyền thống hay biến thể Hồng Kông.

Các quyết định sản phẩm theo prompt, khác với chi tiết giải đấu trong PDF:

- Dùng tọa độ a1–h4 cố định của R0-02; không dùng định dạng a1–d8 trong phần biên bản của PDF.
- Chọn người đầu ngẫu nhiên; PDF cho phép hai bên thỏa thuận cách chọn.
- R1-02 chốt hòa ở 60 nửa-lượt không tiến triển và lần lặp thứ ba, không dùng mốc 40 của PDF. Không áp dụng giới hạn 30 giây/nước hoặc xử phạt giải đấu.

[Mistboard — Banqi Rules](https://mistboard.com/rules/banqi), cập nhật 29/10/2026, xác nhận trang này chuyển sang 60 ply trong tháng 10/2026. Banqi Game chủ động chọn quy ước bên dưới; không tuyên bố đây là bộ luật quốc tế duy nhất và **không áp dụng ngoại lệ đuổi quân/chase của Mistboard**.

## Bộ luật thực thi theo R1-01

### Bàn, quân và lượt

- Bàn logic 8×4, `x = 0..7`, `y = 0..3`, index `y * 8 + x`: a1 là 0, h4 là 31. Engine không biết hướng bàn hoặc theme.
- Mỗi màu đỏ/đen: 1 Tướng, 2 Sĩ, 2 Tượng, 2 Xe, 2 Mã, 2 Pháo, 5 Tốt. Tạo 32 quân riêng biệt về đối tượng, đều úp, xáo bằng Fisher–Yates.
- Hai người được định danh bằng số `0`, `1`, màu ban đầu `[null, null]`. Người đầu được chọn ngẫu nhiên, bắt buộc lật một quân. Màu quân đó thuộc người đầu; người còn lại nhận màu đối lập. Lượt chuyển ngay sang người kia.
- Mỗi lượt chỉ lật một ô úp bất kỳ hoặc đi/ăn bằng một quân đã lật của mình. Lật trúng quân địch vẫn hết lượt và không cho quyền dùng quân đó. Không pass hay chuỗi hành động.
- Mọi quân, kể cả Pháo và Tốt, đi đúng một ô trống ngang/dọc theo cả bốn hướng. Không sông, cung, chân Mã, đi chéo hoặc bước ra ngoài bàn.

### Ăn quân thường

Chỉ ăn địch đã lật ở ô kề ngang/dọc. Bảng dưới ghi toàn bộ đích hợp lệ, sau khi kiểm tra vị trí, màu và trạng thái lật:

| Quân tấn công | Loại quân địch có thể ăn kề |
| --- | --- |
| Tướng (`general`) | Tướng, Sĩ, Tượng, Xe, Mã, Pháo; không Tốt |
| Sĩ (`advisor`) | Sĩ, Tượng, Xe, Mã, Pháo, Tốt |
| Tượng (`elephant`) | Tượng, Xe, Mã, Pháo, Tốt |
| Xe (`rook`) | Xe, Mã, Pháo, Tốt |
| Mã (`horse`) | Mã, Pháo, Tốt |
| Pháo (`cannon`) | Không ăn kề bất kỳ loại nào |
| Tốt (`pawn`) | Tốt hoặc Tướng |

Quân cùng cấp được ăn nhau, riêng Pháo phải dùng quy tắc ngòi. Tốt không ăn Pháo; Mã ăn Pháo được.

### Pháo

- Đích phải là quân địch đã lật, trên cùng hàng hoặc cột với Pháo.
- Đoạn giữa nguồn và đích có **đúng một ô có quân**. Không tính nguồn/đích hoặc quân nằm ngoài đoạn đó. Ngòi có thể là bất kỳ loại/màu, úp hoặc lật; các ô còn lại trong đoạn phải trống.
- Khi đủ điều kiện, Pháo ăn mọi cấp, gồm Tướng và Pháo khác. Không ngòi hoặc từ hai ngòi trở lên đều không hợp lệ.
- Không ăn kề, ăn chéo, ăn quân úp/đồng minh hoặc nhảy qua ngòi vào ô trống. Ngòi không bị thay đổi khi Pháo ăn. Một lần ăn kết thúc lượt, không ăn liên hoàn.

## Kết thúc ván và hòa — R1-02

Chỉ xét sau một hành động hợp lệ, sau khi đã cập nhật bàn và chuyển lượt. Khi nhiều điều kiện cùng đúng, chọn đúng một kết quả theo thứ tự:

| Ưu tiên | Điều kiện | `outcome` | `winner` | `reason` |
| --- | --- | --- | --- | --- |
| 1 | Đối phương không còn quân nào trên bàn, kể cả úp (đủ 16 quân đã bị ăn trong ván bình thường) | `win` | Người vừa đi | `all_pieces_captured` |
| 2 | Người đến lượt không có bất kỳ flip/move/capture hợp lệ | `win` | Người vừa đi | `no_legal_actions` |
| 3 | Thế cờ công khai hiện tại xuất hiện lần thứ ba | `draw` | `null` | `threefold_repetition` |
| 4 | Bộ đếm không tiến triển đạt 60 ply | `draw` | `null` | `no_progress_60` |

Mất Tướng không tự thua. Không có chiếu/chiếu bí, hòa stalemate hoặc hòa thiếu lực lượng. Còn một ô úp bất kỳ vẫn có nước lật nên không thua vì hết hành động; điều này không ngăn thắng do toàn bộ quân địch đã bị ăn nếu các ô úp còn lại đều thuộc bên thắng.

### 60 nửa-lượt

`noProgressPly` bắt đầu ở 0. Mỗi nước đi vào ô trống tăng đúng 1; lật hoặc ăn đặt về 0. Nước sai không cập nhật bất kỳ bộ đếm nào. 59 vẫn chơi, đúng 60 hòa nếu chưa có điều kiện ưu tiên cao hơn. Đây là 60 hành động đơn của từng người, không phải 60 lượt đầy đủ/120 ply.

### Lặp ba lần

Khóa là chuỗi JSON chuẩn tắc của `[boardPublic, turn, playerColors]`. Bàn có đủ 32 phần tử ở index logic `y * 8 + x`: ô trống mã hóa `null`, ô úp là `"?"`, quân đã lật là `[color, type]`. `turn` là người **tiếp theo** đến lượt. `playerColors` phân biệt `[null, null]`, `[red, black]` và ngược lại. Không dùng hash rút gọn có nguy cơ va chạm hoặc `JSON.stringify(privateState)`.

Không đưa danh tính/ID quân úp, seed RNG, theme/hướng bàn, thời gian, tham chiếu, danh sách quân đã ăn, trạng thái kết thúc hoặc các bộ đếm vào khóa. Cùng mặt công khai và cùng lượt/ánh xạ màu luôn tạo cùng khóa, bất kể cách hoán đổi danh tính quân úp.

Vị trí khởi tạo được ghi một lần. Sau mỗi hành động hợp lệ, ghi vị trí mới đúng một lần; hòa ở lần xuất hiện thứ ba, dù các lần xuất hiện không liên tiếp hoặc đi qua các chuỗi nước khác nhau. `positionCounts` chỉ là bảng tần suất nội bộ phục vụ phân xử, không lưu thứ tự nước đi hay replay. Bảng được giữ qua lật/ăn; các vị trí cũ không thể quay lại sau bước đó vì số ô úp hoặc tổng quân trên bàn đã giảm.

### Ván đã kết thúc

`status` chuyển từ `playing` sang `finished`, `result` trở thành nguồn sự thật cho UI/Online tương lai. Lượt cuối và các bộ đếm được giữ như sau nước kết thúc. `getLegalActions` luôn trả `[]` cho mọi người; `applyAction` trả `GAME_OVER` trước các kiểm tra khác và không đổi bàn/lượt/bộ đếm/kết quả. Không phát thêm event. Đây là khóa gameplay qua API; không phải đóng băng object JavaScript hoặc cơ chế chống sửa bộ nhớ bằng DevTools.

## Hợp đồng dữ liệu

`privateState` và `publicState` là object dữ liệu thuần; các API nhận state đúng schema do engine tạo (fixture trong test cũng theo schema này). Chưa có API nạp/kiểm tra một state tùy ý từ mạng. `applyAction` luôn kiểm tra action dựa trên private state tin cậy, không tin public snapshot do phía gọi sửa lại.

```js
// PRIVATE — chỉ bộ phận nắm thẩm quyền ván giữ dữ liệu này.
{
  board: [/* đúng 32 ô: null hoặc {color, type, faceDown} */],
  turn: 0,                  // 0 hoặc 1
  playerColors: [null, null], // sau lần lật đầu: ['red', 'black'] hoặc ngược lại
  captured: [],              // quân đã bị ăn: {color, type}, theo thứ tự ăn
  status: 'playing',         // 'playing' hoặc 'finished'
  result: null,              // hoặc {outcome: 'win'|'draw', winner: 0|1|null, reason}
  noProgressPly: 0,          // số hành động liên tiếp chỉ đi vào ô trống
  positionCounts: {}        // nội bộ: khóa công khai -> số lần; ván mới có 1 khóa: 1
}
```

`color` là `red`/`black`; `type` là một trong bảy tên tiếng Anh ở bảng trên. Không lưu seed, RNG, ID bí mật, lịch sử nước đi hoặc thông tin hướng giao diện. Bảng `positionCounts` có giá trị nguyên dương, chỉ chứa khóa từ mặt công khai.

Snapshot public giữ `turn`, bản sao `playerColors` và `captured`, thêm `status`, bản sao `result`, `noProgressPly`, `repetitionCount` (số lần xuất hiện của **vị trí hiện tại**). Không công bố `positionCounts` hoặc toàn bộ khóa/lịch sử. Từng ô vẫn theo schema R1-01:

| Trạng thái ô | Dữ liệu public |
| --- | --- |
| Trống | `null` |
| Úp | `{occupied: true, faceDown: true}` |
| Đã lật | `{occupied: true, faceDown: false, color, type}` |

Tọa độ suy ra từ index mảng, không phải danh tính bí mật của quân. Hàm dựng public bằng danh sách trường cho phép, không spread nguyên quân private. Thuộc tính lạ/nested metadata ở state hoặc quân không đi vào snapshot/event. Snapshot, arrays và các object con đều mới; sửa snapshot không sửa private state.

Tương thích state R1-01 chưa có trường mới: mặc định `status = playing`, `result = null`, `noProgressPly = 0`, vị trí hiện tại xuất hiện 1 lần. Khi thực hiện hành động hợp lệ, engine bổ sung metadata vào state mới và bắt đầu bảng đếm từ vị trí đầu vào. Không thể khôi phục các ply/vị trí quá khứ chưa được lưu; đây không phải API nhập ván hoặc bypass luật. Fixture mới trong test có thể dùng bảng đếm rỗng để chỉ bắt đầu từ thế cờ đang kiểm tra.

## Bốn API export

### `createGame(options?)`

Trả private state mới. `options` có thể chứa:

- `random`: hàm trả số hữu hạn trong `[0, 1)`, mặc định `Math.random`.
- `firstPlayer`: `0` hoặc `1`, bỏ qua nếu muốn chọn ngẫu nhiên.

Nếu không chỉ định người đầu, lấy một mẫu random để chọn người trước, sau đó dùng 31 mẫu cho Fisher–Yates. Thuật toán xáo không thêm thiên lệch khi nguồn random độc lập và phân bố đều; một nguồn giả lập cố định chỉ phục vụ test, không mang bảo đảm ngẫu nhiên. Đây không phải cơ chế random mật mã cho Online.

Options/kiểu random sai gây `TypeError`; người đầu hoặc giá trị random ngoài miền gây `RangeError`. Nguồn random truyền vào có thể được dùng để tái lập test, không được lưu vào state/public và không có nút cheat ở UI.

### `getPublicState(privateState)`

Trả snapshot theo bảng schema ở trên, không có tham chiếu mutable tới private state. Với hai cách xếp danh tính quân úp khác nhau nhưng cùng thông tin công khai, kết quả public giống nhau.

### `getLegalActions(publicState, player)`

Trả danh sách action mới, chỉ dùng thông tin public. Ván `finished`, sai người hoặc ngoài lượt đều trả `[]`. Trước khi phân màu chỉ sinh nước lật. Chỉ có hai dạng:

```js
{ type: 'flip', at: 'a1' }
{ type: 'move', from: 'a1', to: 'a2' } // đích có địch đã lật nghĩa là ăn
```

Danh sách có thứ tự xác định theo index nguồn/đích. Không đọc danh tính quân úp, kể cả khi dùng ô úp làm ngòi. Snapshot tương đương cho danh sách action tương đương. UI lấy kết quả từ `status/result`, không suy đoán chỉ từ `[]` (vì ngoài lượt cũng nhận `[]`).

### `applyAction(privateState, player, action)`

Kiểm tra đúng lượt, cấu trúc action, tọa độ và tính hợp lệ; action chỉ có các trường trong hai dạng nêu trên. Không tự sửa/coerce tọa độ, không nhận batch/pass/capture riêng hoặc trường phụ. Hàm không mutate đầu vào.

Thành công trả `{ok: true, state, event}`: `state` là **private state mới**, tuyệt đối không gửi nguyên kết quả này cho UI/AI/đối thủ. Chỉ chuyển `getPublicState(result.state)` và `result.event` cho phần tiêu thụ dữ liệu công khai. Event có thể công bố:

```js
{ type: 'flip', player: 0, at: 'a1', piece: {color: 'red', type: 'pawn'} }
{ type: 'move', player: 0, from: 'a1', to: 'a2',
  piece: {color: 'red', type: 'rook'},
  captured: null } // hoặc {color, type} của quân đã lật vừa bị ăn
```

Lượt luôn chuyển sang `1 - player` khi thành công, kể cả nước kết thúc. Sau đó cập nhật bộ đếm không tiến triển, ghi khóa mới và xét kết quả theo ưu tiên. Khi ăn, nguồn thành trống và quân đích đi vào `captured`; không xóa ngòi, không di chuyển quân khác. Event giữ nguyên hình dạng R1-01, không giữ tham chiếu mutable tới state và chỉ lộ danh tính mới ở chính ô vừa lật. Kết quả thắng/hòa được đọc từ `getPublicState(result.state)`, không thêm một event gameplay thứ hai.

Thất bại trả đúng `{ok: false, error}`; không trả state, action gốc hay chi tiết bí mật:

| Thứ tự kiểm tra | Mã lỗi |
| --- | --- |
| Ván đã `finished` (ưu tiên kể cả player/action sai) | `GAME_OVER` |
| Player không phải số 0/1 | `INVALID_PLAYER` |
| Không tới lượt player | `NOT_YOUR_TURN` |
| Action sai dạng hoặc tọa độ ngoài a1–h4 | `INVALID_ACTION` |
| Đúng dạng nhưng không hợp luật | `ILLEGAL_ACTION` |

## Ranh giới công bằng và việc chưa làm

UI/AI tương lai chỉ tiêu thụ snapshot/event công khai. Bộ phận giữ private state mới được gọi `applyAction`. Trong Offline, bí mật vẫn nằm trên máy người chơi; phân tách dữ liệu này **không chống được DevTools**. Online về sau phải giữ private state và xử lý action ở backend; module hiện tại chưa tạo backend hoặc cơ chế chống gian lận qua mạng.

Chưa có xin hòa/đồng ý hòa, chịu thua, đồng hồ/hết giờ, mất kết nối, ngoại lệ chase, undo, replay, Bot, networking hoặc gameplay UI. Bước tiếp theo chỉ được đề xuất: **nối engine vào gameplay Offline sau khi chủ dự án duyệt**; không triển khai trong R1-02.

## Chạy kiểm thử

Không cài package hoặc build. Engine unit test dùng Node tích hợp:

```text
node --test tests/engine.test.cjs tests/endgame.test.cjs
```

Chạy tất cả unit test và hồi quy Chrome R0-02 (Node 22+, Chrome có sẵn như hướng dẫn README):

```text
node --test tests/engine.test.cjs tests/endgame.test.cjs tests/mapping.test.cjs tests/browser.test.cjs
node --check js/engine.mjs
node --check tests/engine.test.cjs
node --check tests/endgame.test.cjs
git diff --check
```

Test engine dùng fixture nhỏ riêng trong file test, không tạo API cheat ở production. Có ma trận ăn kề 7×7 theo hai màu/bốn hướng; Pháo với đủ loại đích, ngòi và hướng; lỗi action và bất biến state; snapshot/event; hai bố cục bí mật tương đương; public giả; kiểm tra truy cập danh tính úp bằng getter báo lỗi; chuỗi thao tác tái lập bảo toàn cơ cấu quân. Test giao diện R0 giữ nguyên, chưa nối engine vào trang.

`tests/endgame.test.cjs` kiểm tra thắng/hòa, khóa/counter và game over. Fixture kết thúc có đủ tổng 16 quân mỗi màu bằng cách đưa quân vắng mặt vào `captured`, luôn bắt đầu `playing`/`result = null`; kết quả do action hợp lệ thật tạo ra. Test 59→60 và hòa lặp đồng thời 60 dùng chuỗi 60 nước thật. Một số fixture đặt counter ở 59 để kiểm tra biên; hai ca ưu tiên thắng/lặp cố ý đặt tần suất đích thành 2 bằng khóa lấy từ một chuyển trạng thái thật, nhằm ép các điều kiện đồng thời (không tuyên bố đó là lịch sử ván khả đạt). Không đặt trước winner/result để nhận PASS giả.
