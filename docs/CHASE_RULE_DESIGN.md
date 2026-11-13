# R2-02 / R2-03A / R2-03C — Kiểm toán luật và thiết kế trường tróc

**Trạng thái: ba quyết định R2-03A giữ nguyên; UI R2-03B đã triển khai. R2-03C mở rộng riêng cách đếm lặp sau khi đoạn đuổi từng hoãn hòa kết thúc; xem C2.1 và bằng chứng cuối tài liệu.**

Rà soát ngày 10/11/2026, trên checkpoint R2-01 `d0509c3f0acd7549872a55c97daf0a23b343f850`. R0–R1 ở `663b03b`. Hợp đồng runtime cập nhật trong [RULES.md](RULES.md). **Nguồn** là chứng cứ điều lệ; **house adjudication** B–C là quy ước game đã được chủ dự án duyệt ở prompt R2-03A. Mục A3, bảng C1 và bằng chứng R2-02 giữ bối cảnh trước triển khai; mục cuối ghi kết quả mới. D2 và phần UI trong E vẫn là thiết kế cho R2-03B.

Phương án ưu tiên duy nhất: **một quân đuổi cùng một quân, lần 7 ghi một lỗi, lỗi thứ hai thua; cảnh báo trước nước phạm lỗi; ngăn hòa lặp do một bên truy đuổi liên tục; ngoại lệ quân không thoát được giới hạn bằng phép kiểm tra công khai một nửa-lượt.** Đây là biến thể Banqi Game lấy mốc xử phạt từ Nam Đầu, không phải bản sao toàn bộ điều lệ giải hoặc “luật quốc tế”.

## A. Nguồn và lựa chọn của game

### A1. Nguồn đã đọc

| Nguồn | Nội dung xác minh và giới hạn |
| --- | --- |
| [Hsu — Rules for Chinese Dark Chess, 06/09/2019](https://homepage.iis.sinica.edu.tw/~tshsu/tcg/2021/hwks/rules.pdf), một trang | 32 quân, thứ bậc/ngoại lệ, Pháo qua ngòi; thua khi hết quân/hết nước; 60 nước đơn không ăn/lật; diễn đạt lặp bàn **liên tiếp** ba lần. Có hai lần phạm quy xử thua và trọng tài quyết định tiếp tục, nhưng không định nghĩa trường tróc 6/7. Không nhầm với PDF 2008 được dùng ở R1. |
| [115年度南投縣名間鄉全國暗棋錦標賽 — 16/05/2026](https://www.beclass.com/rid=305263a69d8d7bd3878f), mục 19, phần quy tắc thứ hai, khoản 5–7 | Xác nhận một quân liên tục bắt đuổi cùng một quân: tối đa 6, lần 7 tính một lỗi kỹ thuật, hai lỗi/ván xử thua; ghi ngoại lệ **`必死除外`**; người chơi gọi trọng tài, tranh chấp do trọng tài quyết định. Không giải thích chính xác “必死”, cách khôi phục/tiếp tục sau lỗi đuổi, reset chuỗi hay phân trách nhiệm khi hai bên cùng đuổi. |
| [Mistboard — Banqi Rules](https://mistboard.com/rules/banqi), cập nhật 07/11/2026 | Định nghĩa riêng: nước đi không ăn/lật đe dọa quân địch vừa đi, có được bảo vệ hay không. Loại nước đuổi tạo lần lặp thứ ba, trừ khi không còn nước hợp lệ khác; đuổi qua các thế mới không bị giới hạn. Dùng 60 ply. Chỉ tham khảo so sánh, không lấy cơ chế cấm nước này làm luật chính. |

PDF Hsu và trang Mistboard đọc được qua công cụ web. BeClass mở trực tiếp bằng công cụ web báo 403; kết quả tìm kiếm trả toàn văn của chính trang, sau đó tải URL gốc bằng HTTP trực tiếp thành công **200** và đối chiếu lại các khoản liên quan. Không còn nguồn nào trong ba nguồn trên chưa đọc được; không xác minh các sửa đổi miệng tại giải hoặc quyết định của trọng tài từng ván.

### A2. Các khác biệt cần trình bày đúng

- **Pháo:** Hsu viết `炮不可以走步吃兵或炮`, chỉ nêu Tốt/Pháo trong câu ngoại lệ. Không suy diễn rằng Pháo được ăn kề quân cấp cao: kết hợp thứ bậc trong cùng PDF, Pháo vốn không ăn được các cấp trên. Vì vậy đây trước hết là khác biệt cách diễn đạt, chưa phải bằng chứng xung đột hành vi. Game giữ quyết định rõ ràng: **Pháo không ăn kề bất kỳ quân nào**.
- **Lặp bàn:** Hsu dùng cách diễn đạt liên tiếp, không cho một thuật toán khóa đầy đủ. Game hiện đếm ba lần không bắt buộc liên tiếp, cùng bàn công khai/lượt/ánh xạ màu. Không âm thầm đổi sang cách hiểu khác.
- **Hòa không tiến triển:** Nam Đầu có quy trình yêu cầu đếm 25 vòng khi toàn bàn đã mở, ăn quân bắt đầu đếm lại. Không đồng nhất quy trình ấy với 60 ply tự động của game. Chỉ lấy mốc trường tróc 6/7 và hai lỗi, không nhập toàn bộ luật giải.
- **Không trộn luật:** không đưa trường chiếu, cung, sông, chân Mã, quân được bảo vệ theo Xiangqi, giới hạn giờ hay luật chạm quân vào Banqi Game. Mục tiêu cảnh báo trước vi phạm là yêu cầu sản phẩm, không gán cho điều lệ nguồn.

### A3. Kiểm toán runtime tại mốc R2-02 (trước R2-03A)

Đọc [engine.mjs](../js/engine.mjs), [offline.mjs](../js/offline.mjs), [RULES.md](RULES.md), [SPEC.md](SPEC.md), cùng các suite [engine](../tests/engine.test.cjs), [endgame](../tests/endgame.test.cjs), [gameplay](../tests/gameplay.test.cjs), [browser](../tests/browser.test.cjs) và [mapping](../tests/mapping.test.cjs).

| Hạng mục | Hiện tại và kết luận |
| --- | --- |
| Khởi tạo/phân màu | `createGame`: 16 quân mỗi màu, cơ cấu 1/2/2/2/2/2/5; Fisher–Yates, ngẫu nhiên người đầu. `applyAction`: lật đầu gán màu, chuyển lượt đúng một lần. Có test cả hai người/hai màu. |
| Ăn thường | `canMove`: đích phải mở và khác màu; đi/ăn kề ngang dọc; Tốt chỉ ăn Tốt/Tướng, Tướng không ăn Tốt; Mã ăn Pháo. Ma trận 7×7 kiểm tra hai màu/bốn hướng. Không thấy lỗi so với quyết định R1. |
| Pháo | Chỉ nhảy ăn cùng hàng/cột với đúng một ô có quân ở giữa; ngòi úp/lật đều được; không ăn kề, quân úp hoặc đồng minh; không nhảy vào ô trống. Test đường dài/ngòi 0, 1, nhiều hơn và đích mọi cấp. |
| Thắng/hòa | `updateOutcome`: hết quân địch (kể cả úp) → địch hết hành động → lặp 3 → 60 ply. Lật/ăn reset ply; invalid không thay state. Mất Tướng chưa tự thua. `finished` khóa legal/action. |
| Lặp công khai | `positionKey` chứa 32 ô trống/úp/màu-loại đã mở, lượt, ánh xạ màu. Bỏ danh tính úp, seed, ID, UI. `positionCounts` chỉ giữ tần suất, không giữ thứ tự/lần xuất hiện theo ply. |
| Danh tính quân | Quân chỉ có `color/type/faceDown`; clone tạo object mới. Không có ID bền qua move; tọa độ đổi, hai quân cùng màu/loại không thể phân biệt chỉ bằng snapshot. Event `from/to` có thể làm căn cứ theo dõi, nhưng engine chưa lưu chuỗi đó. Không dùng object reference, tọa độ cố định hoặc ID theo thứ tự xáo làm danh tính. |
| Công bằng | `getPublicState` dùng allowlist, quân úp chỉ có `occupied/faceDown`. Controller giữ private state trong module; render từ public và event. Bộ test hidden permutation, getter cấm đọc bí mật, immutability và DOM vẫn PASS. |
| Warning/UI | `render` đọc `status/result`, `REASONS` có bốn lý do; `say` chỉ thay một thông báo, không spam. Chưa có counter lỗi, dự báo nước phạm lỗi hoặc lý do thua trường tróc. Có thể thêm một dòng cảnh báo và dữ liệu engine; không cần engine UI thứ hai/dashboard. |

**Phát hiện quan trọng:** hòa lặp có thể chặn ván trước lần đuổi thứ 7 (ca tái hiện ở C1). Đây là khoảng trống khi bổ sung trường tróc, không phải lỗi so với đặc tả R1-02 vốn chưa có luật này. Không tìm thấy blocker runtime khác trong phạm vi kiểm tra. `docs/RULES.md` ghi mốc R1 và nguồn cũ; không sửa file đó trong R2-02, cập nhật nguồn/biến thể khi triển khai được duyệt.

## B. Định nghĩa truy đuổi có thể kiểm thử — house adjudication

B1–B4 và C2–C4 là **house adjudication đã duyệt, được thực thi ở R2-03A**. D1 đã trở thành hợp đồng public; D2/UI sẽ thực hiện ở R2-03B. Không coi những chi tiết tự động hóa sau là điều lệ nguyên văn.

### B1. Đe dọa ăn hợp lệ

Gọi `S` là snapshot công khai trước nước, `S'` là bàn sau nước hợp lệ, `p` là người vừa đi, `A` là quân vừa di chuyển, `B` là quân đối phương. Một ứng viên đuổi `(A,B)` phải thỏa tất cả:

1. Hành động là `move` **vào ô trống**, không phải lật hoặc ăn; A đã mở và thuộc p.
2. B còn trên bàn, đã mở, khác màu A.
3. Trên bàn S', giả sử đến lượt p và đối thủ chưa thay đổi gì, nước **A ăn B** hợp lệ theo luật ăn cơ bản hiện có. Đây là kiểm tra đe dọa cho lượt tiếp theo, không cấp thêm lượt thật và không khẳng định đối thủ không thể cứu B.
4. Cặp này không thuộc ngoại lệ công khai ở B4.

Không chỉ kiểm tra “gần nhau”, không dùng rank riêng trong UI. Pháo phải đủ đúng một ngòi; ngòi úp chỉ là ô có quân. Tốt/Tướng và Mã/Pháo dùng cùng hàm luật cơ bản. B được quân khác bảo vệ không tự làm mất đe dọa; kế hoạch ăn lại A sau khi B chết không được coi là B đã thoát.

Quyết định đã duyệt tính **mối đe dọa tồn tại sau nước**, không đòi trước nước phải chưa có đe dọa (Pháo có thể dịch dọc đường ngắm mà vẫn đuổi cùng mục tiêu). Không đòi B là quân vừa đi: nếu đối thủ dùng quân khác, A vẫn có thể tiếp tục đuổi B. Chỉ đe dọa **do chính quân A vừa đi**; nước chuyển ngòi làm một Pháo khác đe dọa không tính là A đuổi. Đây là lựa chọn để bám phạm vi “một quân đuổi một quân”, không áp định nghĩa Mistboard.

Hàm kiểm tra tương lai phải dùng lại `canMove`/bộ sinh nước cơ bản trong engine, có lớp nội bộ bỏ qua rào `turn/status` khi phân tích giả định. Không gọi đệ quy `applyAction → updateOutcome → phân tích đuổi → applyAction`; không thay đổi public `turn` để cho UI thực hiện ngoài lượt.

### B2. Danh tính và chuỗi

- Khi lật lần đầu, cấp ID quan sát `v1`, `v2`, ... theo **thứ tự lật công khai**, không theo quân trong bộ/xáo/seed. Không cấp/công bố ID cho ô úp. ID đi theo quân qua move; quân bị ăn không tái dùng ID. Một board map song song `visibleIds[32]` đủ giữ ID, `null` ở ô úp/trống; public chỉ thêm `visibleId` cho quân đã mở.
- Mỗi người có tập `runs` của **các cặp A/B đang được chính người đó đuổi liên tiếp qua các lượt của mình**. Một run gồm `{attackerId, targetId, count, startPly}`; `count` đếm từ lỗi gần nhất, `startPly` đánh dấu bắt đầu đoạn đuổi liên tục để phân trách nhiệm lặp.
- Sau nước đi yên của p, lấy tập ứng viên T theo B1/B4. Cặp còn trong T và run cũ: tăng count 1, giữ startPly. Cặp mới: count 1, startPly = ply vừa thực hiện. Bỏ mọi run cũ của p không còn trong T. Nếu đi quân khác, cặp có A khác là cặp mới.
- Lượt chạy yên của đối phương **không tự xóa run của bên đang đuổi**: B vừa thoát khỏi tầm ăn là điều thường xảy ra. Xét nối hay ngắt khi chính bên đuổi đi tiếp. Vì vậy nhận diện được vòng lặp kết thúc ở nước chạy.
- Ăn hoặc lật của **bất kỳ bên nào** xóa toàn bộ runs, chấm dứt đoạn truy đuổi; không xóa lỗi đã ghi. Quân bị ăn mất ID và mọi cặp chứa ID đó; không thể chuyển chuỗi sang quân cùng loại vừa vào ô cũ.
- Nước không đuổi/đổi toàn bộ mục tiêu ngắt chuỗi của người vừa đi. Target đổi tọa độ mà giữ ID không ngắt; tọa độ chỉ để hiển thị.
- Một nước đe dọa nhiều B: theo dõi mọi cặp, không chọn một đích tùy thứ tự duyệt. Cặp biến mất thì mất chuỗi riêng, cặp còn lại tiếp tục. **Một hành động chỉ ghi tối đa một lỗi**, dù nhiều cặp cùng đạt 7.
- Hai bên được đếm độc lập. Một nước chạy không tạo đe dọa B1 thì không bị ghi là đuổi; không phạt người làm xuất hiện thế lặp chỉ vì họ là người vừa đi. Nếu nước chạy đồng thời thực sự đuổi một quân khác, vẫn xét cặp đó; không có miễn trừ chung cho mọi nước của bên từng bị đuổi.

### B3. Lần 7 và lỗi kỹ thuật

**Nguồn xác nhận mốc 6/7 và hai lỗi. Cách tiếp tục sau đây là house adjudication:**

1. Count 1–6: nước được thực hiện bình thường. Count 7 của ít nhất một cặp: ghi một lỗi cho p.
2. Lỗi đầu: **giữ nước đã thực hiện và chuyển lượt**, không hoàn tác, không bắt đi lại. Reset count của mọi run hiện tại của p về 0, **giữ cặp/startPly** để không biến việc ghi lỗi thành cách xóa trách nhiệm đối với vòng lặp. Bên kia giữ runs của họ. Đoạn tiếp tục cùng cặp cần thêm 7 lần đuổi mới tạo lỗi thứ hai.
3. Lỗi thứ hai: p thua, winner = `1-p`, reason `chase_technical_fouls`. Bàn phản ánh nước vừa thực hiện, khóa ván như kết quả R1. Một nước không thể vừa ghi lỗi 1 và lỗi 2.
4. Không chuyển các click sai/ngoài lượt/action malformed thành lỗi kỹ thuật. Chúng vẫn bị từ chối, không đổi state. Các lỗi vật lý/chạm quân của giải nằm ngoài game này.
5. `getLegalActions` vẫn liệt kê nước hợp lệ về di chuyển kể cả nước sẽ nhận lỗi; warning phải có trước khi chọn đích. Không âm thầm cấm nước như biến thể Mistboard, cũng không chỉ cảnh báo sau khi đã thua.

### B4. Ngoại lệ “quân không thoát được”

Nguồn chỉ ghi `必死除外`; **không đủ căn cứ** hiểu thành “không còn ô trống kề”, “thế thua chắc theo tìm kiếm nhiều ply” hoặc miễn mọi nước khi người đuổi chỉ có một lựa chọn.

Quy ước bảo thủ đã duyệt, kiểm chứng được một ply:

1. Chỉ xét miễn khi **toàn bộ bàn đã mở**. Còn ô úp: không kết luận bắt buộc chết bằng việc soi danh tính ẩn; cặp vẫn tính bình thường. Đây là giới hạn chủ động, có thể bỏ sót một số thế chết thực sự.
2. Với S' và cặp A/B đang bị đe dọa, liệt kê **tất cả phản hồi hợp lệ cơ bản của đối phương**. Với mỗi phản hồi, chỉ mô phỏng bàn công khai, chưa xét lặp/60/trường tróc.
3. “Cứu được B” nếu B còn sống và A đã bị ăn, hoặc A không còn nước ăn B ngay sau phản hồi. Bao gồm B tự chạy/ăn A, quân khác ăn A, đổi/chặn/ngắt ngòi Pháo. Không chỉ xét nước của B. Không cần đoán đối thủ sẽ chọn nước cứu hay không.
4. Nếu **không có phản hồi nào cứu B**, miễn cho cặp A/B ở nước đang xét: không tăng count, bỏ run cặp đó; các cặp khác vẫn xét. Nếu đối phương không có hành động nào, điều kiện thắng hết nước vẫn được xét ở C4.

Ví dụ không chạy được nhưng chưa thua ván: Đỏ có Tướng c2; Đen có Sĩ b3 và Tốt a3, c3, b4; các quân khác đã bị ăn. Sau `c2-b2`, Sĩ bị quân mình chặn và không ăn được Tướng, các Tốt có nước nhưng không cứu được Sĩ một ply: miễn cặp này. Thêm Tốt Đen b1 thì `b1-b2` ăn Tướng cứu Sĩ: **không miễn**. Phải dùng Tốt trong ví dụ cứu này: Xe không ăn được Tướng. Thêm một quân úp h4 thì không áp phép miễn bảo thủ này.

Không tuyên bố đây là nghĩa chính thức của “必死”. Không dùng solver/Bot, thế thua dài hạn hoặc nội dung ô úp. Chủ dự án đã duyệt cách hiểu bảo thủ này trong R2-03A.

## C. Xung đột lặp ba lần, 60 ply và thứ tự phân xử

### C1. Tái hiện trên engine R2-01: mới đuổi 4 lần đã hòa

Fixture hợp lệ về dữ liệu: Người 1/Đỏ có Tướng b2; Người 2/Đen có Sĩ c3; tất cả đã mở, ô khác trống; đưa 30 quân còn lại vào `captured` đúng cơ cấu để mỗi màu vẫn đủ 16 quân. Đỏ đến lượt, `noProgressPly=0`, `status=playing`, `result=null`, lịch sử bắt đầu từ vị trí này. Không giả định đây là replay đã chơi từ khai cuộc.

| Ply | Người | Nước | Số lần Tướng Đỏ đuổi Sĩ | Lần xuất hiện của thế hiện tại | Kết quả R1/R2-01 |
| --- | --- | --- | --- | --- | --- |
| 0 | Đỏ đến lượt | Tướng b2, Sĩ c3 | 0 | 1 | Đang chơi |
| 1 | Đỏ | b2-c2 | 1, dọa c3 | 1 | Đang chơi |
| 2 | Đen | c3-b3 | 1 | 1 | Đang chơi |
| 3 | Đỏ | c2-b2 | 2, dọa b3 | 1 | Đang chơi |
| 4 | Đen | b3-c3 | 2 | 2 | Trở lại thế ply 0 |
| 5 | Đỏ | b2-c2 | 3 | 2 | Đang chơi |
| 6 | Đen | c3-b3 | 3 | 2 | Đang chơi |
| 7 | Đỏ | c2-b2 | 4 | 2 | Đang chơi |
| 8 | Đen | b3-c3 | 4 | 3 | `draw / threefold_repetition`, 8 quiet ply |

Đã chạy tám nước bằng `applyAction` thật, assert mọi nước `ok`, kiểm tra nước ăn giả định bằng `getLegalActions` trên public và assert kết quả hòa trên ply 8. Không chỉnh runtime hoặc thêm test vào suite. Sĩ không ăn được Tướng; để giữ Sĩ, Đen phải thoát khỏi đe dọa, nhưng có thể chọn các ô chạy khác: không khẳng định đây là chuỗi nước duy nhất hợp lệ.

**Kết luận tại R2-02:** thêm kiểm tra “count >= 7 trước hòa” là chưa đủ; count mới 4. Chỉ kiểm tra nước cuối có đuổi cũng sai vì ply 8 là nước chạy của Đen. **R2-03A đã chạy đủ 27 action thật trong `tests/chase.test.cjs`: ply 8 hoãn hòa; ply 13 lỗi 1, giữ nước/chuyển lượt/count 0/startPly 1; ply 27 lỗi 2, winner 1 và reason `chase_technical_fouls`.** Warning đúng action có trước ply 13/27, `nextFault` lần lượt 1/2, `losesGame` false/true. Đen không nhận lỗi vì chạy.

### C2. Trách nhiệm khi có lặp ba lần

Giữ nguyên khóa công khai và cách đếm không bắt buộc liên tiếp. **Không thêm ID, count lỗi hoặc chase counter vào khóa** để né phát hiện lặp; không đặt `noProgressPly=0` chỉ vì có đuổi. R2-03C bổ sung mốc đủ điều kiện ở C2.1; tần suất lịch sử vẫn giữ nguyên.

Tối thiểu cần thêm `ply` (tăng mỗi hành động thành công) và `positionLastPlies[key]` (ba chỉ số xuất hiện gần nhất), bên cạnh tần suất đang có. Vị trí khởi tạo ghi ply 0. Kết hợp với `startPly` trong runs, không cần lưu replay hoặc toàn bộ thứ tự nước đi:

1. Khi thế hiện tại đã xuất hiện ít nhất ba lần **trong giai đoạn đủ điều kiện C2.1**, lấy ba mốc gần nhất `i < j < k`. Khảo sát cửa sổ hành động **(i, k]**, bỏ qua nước trước i.
2. p là bên **đuổi liên tục trên vòng lặp** nếu tồn tại một run cùng A/B, còn hiện hành, bao phủ mọi lượt của p trong cửa sổ. Vì run chỉ tồn tại khi p tiếp tục cặp trên mỗi lượt riêng, kiểm tra `startPly <= firstOwnPly` là đủ. `firstOwnPly = i+1` nếu p đến lượt ở thế i, ngược lại `i+2`; phải thực sự có lượt đó trong cửa sổ. Cùng khóa nên lượt ở i giống lượt ở k.
3. Đúng một bên thỏa: **chưa cho hòa do lặp**. Chỉ tiếp tục ván và cảnh báo; không ghi lỗi sớm ở lần lặp 3. Bộ đếm 7/2 vẫn quyết định lỗi. Áp dụng kể cả khi người vừa đi là bên chạy.
4. Không bên nào thỏa: hòa lặp như R1. Hai bên đều thỏa: cho hòa lặp sau khi xét lỗi thứ hai; không tự chọn người vừa đi làm thủ phạm. Đây là house adjudication đã duyệt, không phải điều lệ nguyên văn đã xác nhận.
5. Lỗi đầu reset count nhưng **không reset startPly**; do đó vẫn hoãn hòa nếu tiếp tục cùng đoạn đuổi. Nếu p thật sự bỏ đuổi/đổi toàn bộ cặp, run cũ kết thúc. R2-03A vẫn dùng tần suất cả ván ở lần lặp sau; R2-03C thay riêng điểm đó bằng giai đoạn đủ điều kiện mới ở C2.1. Không phát một kết quả hòa “tồn kho” ngay khi họ đi tới một thế chưa lặp.

### C2.1. R2-03C — giai đoạn xét hòa mới sau một đoạn từng hoãn lặp

- Khi C2 thực sự hoãn hòa trong ván còn chơi, lưu `repetitionChase = {player, pairs}` với các cặp liên tục làm căn cứ. Đây là mốc ghi nhận một đoạn đã hoãn lặp, **không phải cứ có một đe dọa thì xóa lịch sử hòa**.
- Qua mỗi action, chỉ giữ giao các cặp được lưu với runs còn liên tục của người đó. Không thêm cặp mới. Nước chạy của đối phương không tự ngắt run; lỗi đầu reset count nhưng giữ cặp nên không mở giai đoạn. Mất một trong nhiều cặp cũng chưa mở khi còn cặp căn cứ khác.
- Khi hết tất cả cặp căn cứ, đặt `repetitionEpochStart = ply` sau nước ấy, bỏ pending. Vị trí sau nước ngắt bắt đầu giai đoạn mới. Không dùng lần xuất hiện trước mốc này để xét hòa về sau; giữ nguyên `positionCounts` và `positionLastPlies` phục vụ tần suất/ba mốc kiểm toán như trước. Không thêm replay hoặc log toàn bộ nước đi.
- Public `repetitionCount` vẫn là tần suất thật cả ván; **`drawRepetitionCount`** mới là số lần đủ điều kiện, chặn trên ở 3. Khi mốc chưa đổi, dùng tần suất cũ để tương thích R1; khi đã đổi, đếm mốc `>= repetitionEpochStart` trong last-three. Ba mốc là đủ chứng minh có/không đủ ba lần, không cần bảng tần suất giai đoạn thứ hai. `drawDeferred` chỉ báo hoãn khi đủ ba lần mới và đúng một bên liên tục đuổi.
- Không reset quiet ply, lỗi hoặc `quietDrawHold`. Ăn/lật vẫn reset quiet/runs/hold theo luật tiến triển hiện có, đồng thời chấm dứt pending nếu có. Nếu đang hold 60 và bỏ cặp bằng nước yên, vẫn hòa ngay, không lập hold mới nhờ đổi giai đoạn lặp.
- Mục tiêu thay đổi là ngăn việc lấy lần lặp của đoạn đã hoãn để hòa ngay sau khi ngắt rồi đuổi lại. Một đe dọa rời rạc chưa từng hoãn, vòng nước chờ hoặc hai bên cùng đuổi vẫn hòa ba lần như trước. Việc này không biến mọi ngắt run thành lỗi hoặc cấm hòa vĩnh viễn.

**Giới hạn kéo dài bằng nước yên:** trước 60, mỗi action yên vẫn tăng counter. Tại 60, nếu không có hoặc cả hai bên có run thì hòa; đúng một bên thì giữ tập cặp cố định. Nếu người chịu hold làm mất mọi cặp, hòa ngay; nếu còn một cặp sống suốt đoạn, mỗi lượt riêng tiếp tục tăng count và tối đa 14 lượt riêng sẽ dẫn đến hai lỗi (nhanh hơn nếu đã có lỗi/count). Đổi epoch không đụng cơ chế này, nên không thể có chuỗi action yên hợp lệ vô hạn bằng đổi quân/mục tiêu/ngắt–đuổi. Ăn/lật là tiến triển thật và số lần trong ván hữu hạn.

Theo dõi nhiều cặp bằng mọi runs bao phủ cửa sổ, không bằng “có ít nhất một nước đuổi trong lịch sử”. Đổi qua lại các mục tiêu hoặc các quân đuổi khác nhau không phải một cặp liên tục, nên không thể khóa hòa mãi bằng các đe dọa rời rạc. Ngược lại, nếu một cặp vẫn liên tục dù đồng thời có thêm mục tiêu, vẫn phải chịu trách nhiệm.

### C3. Tương tác với 60 ply

Giữ bộ đếm thật: đi yên +1, lật/ăn reset 0, invalid không đổi. Không xóa lịch sử hoặc giả reset bộ đếm chỉ vì đang đuổi. **Việc có thể vượt 60 trong lúc phân xử là thay đổi đã duyệt ở R2-03A so với R1.**

- Nếu tới 60, không có run ở cả hai bên hoặc cả hai bên đều đang có run: hòa 60, trừ kết quả ưu tiên cao hơn. “Có run” ở đây là trạng thái sau lượt riêng gần nhất; nước chạy chưa đến lượt người đuổi đi tiếp không xóa run của họ.
- Nếu chỉ một bên có run: tạo **một** `quietDrawHold` cho đoạn không tiến triển này, ghi người chịu trách nhiệm và tập cặp hiện tại; chưa hòa. Run count 0 ngay sau lỗi đầu vẫn là run liên tục có startPly, không phải đã bỏ đuổi.
- Qua mỗi lượt riêng tiếp theo của người đó, tập cặp được giữ chỉ còn giao với các cặp họ thực sự tiếp tục. Không thêm cặp mới vào hold. Nếu vẫn còn ít nhất một cặp: giữ hoãn, đếm lỗi bình thường. Không chuyển hold sang người khác chỉ vì bên kia bắt đầu đuổi.
- Nếu người chịu trách nhiệm đi yên làm mất hết các cặp trong hold: cho hòa 60 ở chính nước đó (trừ thắng/lỗi thứ hai/lặp được phép có ưu tiên cao hơn), **không lập hold mới** cho cặp khác. Họ đã ngừng kiểu truy đuổi bị ràng buộc; quy tắc không cam kết cấm mọi chiến lược cầu hòa hợp lệ.
- Nếu bất kỳ bên nào ăn/lật: bộ đếm về 0, xóa hold và runs; tiếp tục ván, giữ các lỗi. Nếu chỉ có invalid hoặc đổi UI: hold bất biến.

Với một cặp trong hold được đuổi liên tục, hai lỗi sẽ chặn việc kéo dài vô hạn; đổi quân/mục tiêu để trì hoãn tiếp không gia hạn hold. Một phản hồi cứu quân hoặc đổi ngòi có thể ngắt cặp vào lượt kiểm tra tiếp theo; không xử thua người chạy chỉ vì họ làm đạt 60.

Ví dụ biên đã được test R2-03A: đặt fixture C1 ở counter 59 (fixture ép biên, không khẳng định lịch sử 59 nước đã diễn ra). `b2-c2` tạo đe dọa đầu tiên và counter 60: hold cho Đỏ; không hòa trước khi cho cơ chế 7/2 hoạt động. Nếu Đỏ sau đó bỏ cặp bằng một nước yên, giải phóng hòa 60; nếu ăn/lật thì reset thật.

### C4. Thứ tự phân xử đã duyệt

| Thứ tự | Xử lý |
| --- | --- |
| 0 | `finished`/sai người/sai lượt/sai dạng/sai luật cơ bản: trả lỗi như hiện tại, không đổi bất kỳ counter/ID/hold nào. |
| 1 | Thực hiện nước cơ bản; cập nhật bàn/ID, lượt, ply, counter; tính ứng viên đuổi và ngoại lệ B4; cập nhật runs/lỗi. Ghi vị trí mới đúng một lần. |
| 2 | Lỗi trường tróc thứ hai của người vừa đi: người đó thua. Không cho vi phạm lần hai thoát bằng kết quả thắng/hòa khác. |
| 3 | Đối phương hết quân → người vừa đi thắng. |
| 4 | Đối phương hết hành động **cơ bản** → người vừa đi thắng. Không loại nước được cảnh báo khỏi legal để tạo thua hết nước giả. |
| 5 | Lặp ba lần: áp cửa sổ C2; hòa nếu không có đúng một bên đuổi liên tục; trường hợp hoãn không kết thúc mà chuyển sang kiểm tra 60. |
| 6 | Đạt 60: áp hold C3. Nếu đủ điều kiện giải phóng thì hòa; nếu đang hoãn, giữ `playing` và công bố warning. |
| 7 | Không điều kiện kết thúc: tiếp tục. Lỗi đầu được công bố ngay cả khi một kết quả khác kết thúc ván trong cùng nước. |

Lần đuổi thứ 7 + lặp/60: lỗi 1 được ghi trước; không bỏ qua cảnh báo/lỗi để hòa sớm khi chỉ một bên đuổi liên tục. Nếu hai bên cùng đuổi, quy tắc hòa C2/C3 vẫn có thể kết thúc với lỗi 1 đã ghi; lỗi 2 luôn ưu tiên xử thua.

Lần đuổi thứ 7 + thắng: nước đi yên không thể đồng thời ăn quân cuối. Nếu nó làm đối phương hết mọi nước trên bàn đã mở, B không có phản hồi cứu nên được miễn theo B4; không tạo lỗi từ chính cặp đó và vẫn thắng hết nước. Trường hợp lỗi 2 và thắng cùng được bộ phân xử đưa vào phải theo thứ tự trên; không dựng fixture giả rồi tuyên bố tình huống ấy tự nhiên khả đạt. Nước ăn thật chấm dứt chuỗi, không phải lần đuổi 7.

## D. Cảnh báo trước vi phạm và ranh giới công khai

### D1. Dữ liệu đã triển khai trong R2-03A

Giữ bốn hàm export và dạng action/event hiện có; schema public mở rộng có tài liệu và test. Không thêm trường vào event:

| Nội bộ engine | Public cho UI/AI |
| --- | --- |
| `visibleIds`, bộ cấp ID sau lật | `visibleId` chỉ trên quân đã mở; ô úp vẫn đúng allowlist cũ. |
| `runs[2]` gồm cặp, count, startPly | `chase.runs[2]` gồm ID cặp, tọa độ hiện tại, count; chỉ cặp các quân đã mở. Không cần công bố startPly. |
| `chaseFaults[2]` | `chase.faults: [0..2, 0..2]`; luôn giữ sau khi chuỗi ngắt. |
| `ply`, `positionLastPlies`, `positionCounts`, `repetitionEpochStart`, `repetitionChase` | Không công bố bảng/mốc/pending nội bộ. `repetitionCount` giữ tần suất thật; R2-03C thêm `drawRepetitionCount` 0–3 cho giai đoạn xét hòa hiện tại. |
| `quietDrawHold` và kết quả xét C2 | `chase.drawDeferred` là mảng 0–2 mục `{reason, player, pairs}` theo thứ tự lặp rồi 60; mỗi pair có ID/tọa độ hiện tại. Không biến thành kết quả hòa khi vẫn playing. |
| Phân tích các move cơ bản trên snapshot + metadata công khai | `chase.warnings` cho người đến lượt: `{action, player, pairs, nextFault, losesGame}` cho nước sẽ phạm lỗi; tọa độ pair là sau action giả định. Count 5/6 đọc từ runs để chuẩn bị UI gần mốc. |
| Kết quả sau lỗi 2 | `result = {outcome:'win', winner:1-p, reason:'chase_technical_fouls'}`. |

Warning được tính bằng **cùng phép phân tích engine** sẽ dùng khi áp dụng nước, có xét ngoại lệ/hold; không dùng luật phụ trong controller. `getLegalActions` vẫn nhận public và trả dạng flip/move cũ. Public warning gắn với đúng snapshot, được tính lại sau từng action; `applyAction` luôn tự kiểm tra authoritative state, không tin warning/counter do UI sửa.

Triển khai dùng `quietRuns` chung cho dự báo/xử lỗi; `canMove` và `basicActions` chung cho luật cơ bản/phản hồi một ply. Không phân xử đệ quy. Khi finished, warnings và drawDeferred đều rỗng, giữ faults/runs cuối. State legacy được cấp ID cho quân đang mở theo index bàn, không bịa thứ tự lật cũ; bắt đầu chase/ply tại vị trí nhập, không có lỗi/run quá khứ. Tần suất R1 đã biết vẫn giữ, nhưng thiếu ba mốc ply thật thì không suy ra trách nhiệm hoãn lặp. Schema đầy đủ ở [RULES.md](RULES.md).

Hai private state chỉ hoán đổi danh tính úp, cùng lịch sử quan sát công khai, phải cho cùng visible IDs, counters, warning, legal và phân xử. Ngoại lệ bảo thủ không đọc nội dung úp. Không lộ ID khởi tạo, seed/RNG, cả private state hoặc tham chiếu mutable qua public/event/DOM/log. ID không nằm trong khóa lặp. Offline vẫn không chống soi bộ nhớ bằng DevTools; chưa có Online/Bot.

### D2. Thông báo Việt ngắn, trước nước lỗi

- Count 5: “Người 1 đã đuổi cùng quân 5/6 lần. Hãy đổi cách đi.”
- Count 6, chưa có lỗi: “Đã đuổi 6/6. Đi b2–c2 tiếp sẽ tính lỗi 1/2.”
- Count 6, đã có một lỗi: “Bạn đã có lỗi 1/2. Đi b2–c2 tiếp sẽ phạm lỗi thứ hai và thua.”
- Sau lỗi đầu: “Lỗi trường tróc 1/2 của Người 1. Ván tiếp tục; lỗi tiếp theo sẽ xử thua.”
- Lặp bị hoãn: “Chưa hòa: Người 1 đang liên tục đuổi cùng một quân.”
- Hold 60: “Đã đạt 60 nửa-lượt; đang xét chuỗi đuổi của Người 1. Dừng chuỗi bằng nước yên sẽ hòa.”
- Sau lỗi hai: “Người 2 thắng — Người 1 phạm lỗi trường tróc lần thứ hai.”

Hiện cảnh báo chung ngay khi tới lượt, rồi nêu rõ action có rủi ro khi chọn quân, **trước click/tap/Enter/Space vào đích**. Gắn mô tả truy cập cho đích, không chỉ đổi màu. Không cần modal mới; không giấu cảnh báo trên tooltip chỉ dùng được bằng chuột. Cho biết “lỗi tiếp theo thua” không có nghĩa mọi nước kế tiếp đều thua.

Controller có thể thêm một dòng `aria-live` cạnh lượt, giữ nhãn hai người và Ván mới. Không để `say(event...)` ghi đè cảnh báo lỗi vừa render: warning/lỗi dùng vùng riêng hoặc ghép có thứ tự từ snapshot. Thông báo lỗi đầu phải nhìn thấy kể cả khi vừa kết thúc ván bởi lý do khác. Đổi hướng/theme chỉ render, không đổi bộ đếm; Ván mới reset toàn bộ ID/chase/lỗi/hold. Không dashboard, đồng hồ, âm thanh, SVG hoặc engine UI song song.

## E. Ma trận test và phạm vi kiểm chứng

Ma trận được lập ở R2-02; **phần engine được kiểm chứng ở R2-03A, phần thao tác/hiển thị UI trường tróc chờ R2-03B**. `N` = mốc/luật nền được nguồn xác nhận; `G` = quyết định game đã có ở R1; `H` = house adjudication đã duyệt. Fixture ghi loại/màu, quân thiếu đưa vào captured đúng cơ cấu; không prefill winner/result. Các counter ép biên ghi rõ không đại diện replay khả đạt. Bảng đối chiếu bằng chứng ở cuối tài liệu.

| # | Ca cụ thể | Kỳ vọng | Căn cứ |
| --- | --- | --- | --- |
| 1 | C1: Tướng Đỏ b2-c2 dọa Sĩ Đen c3 | Cặp đúng ID, count 1; không ăn thật | N luật ăn + H định nghĩa đuổi |
| 2 | Tướng a1-b1, Sĩ b2-c2; Tướng b1-c1, Sĩ c2-d2; tiếp dọc tới Tướng g1-h1, Sĩ đang h2 | Đuổi 7 lần tại ply 13 dù không lặp; lỗi 1, không thua | N mốc 7 + H cách nối/tiếp tục |
| 3 | Tướng b2-c2, địch ở d3; hoặc d3 là địch nhưng chỉ đứng chéo | Không đe dọa ăn, count 0 | G + H |
| 4 | Tướng b2-c2, Tốt Đen c3 | Không đuổi Tốt vì Tướng không ăn Tốt | N/G |
| 5 | Tốt b2-c2, Tướng Đen c3; Mã b2-c2, Pháo Đen c3 | Hai fixture đều có đe dọa hợp luật | N/G + H |
| 6 | Pháo Đỏ a1-b1, ngòi d1, đích mở h1; đổi màu/loại/úp-lật ngòi | Cặp Pháo/đích count 1; ngòi úp không lộ | N/G + H |
| 7 | Ca 6 bỏ ngòi; thêm ngòi f1; hoặc đích ở c1 kề Pháo b1 | Không đuổi nếu không có đúng một ngòi | N/G |
| 8 | Ca 6 đích h1 úp, hoặc cùng màu | Không phải mục tiêu; không có targetId bí mật | N/G |
| 9 | Cùng Sĩ c3-b3-c3 trong C1; thêm Sĩ Đen thứ hai cùng loại | ID mục tiêu bền qua di chuyển; không gộp hai Sĩ | H |
| 10 | Chuỗi A/B count 6, A đổi sang C; hoặc quân A2 thay A vào cùng ô | Cặp mới bắt đầu 1; không tính lỗi cho cặp cũ | H |
| 11 | Một nước A đồng thời dọa B và C; B rời chuỗi nhưng C còn; cả hai cùng đạt 7 ở fixture khác | Đếm từng cặp; C tiếp tục; tối đa một lỗi/action | H |
| 12 | Đang đuổi, một bên lật/ăn hoặc A/B bị ăn | Xóa runs/hold, giữ lỗi; đúng reset ply; không dùng lại ID | G + H |
| 13 | Tướng/Sĩ theo 8 nước C1 | Hoãn hòa dù ply 8 là nước chạy; Đen không nhận lỗi | G tình huống + H ưu tiên |
| 14 | Tiếp vòng C1 tới lượt đuổi 6, chọn nước đuổi 7 bằng chuột/keyboard/touch | Warning rõ **trước** action; sau action ghi lỗi 1, giữ bàn/chuyển lượt | N mốc + H UX/tiếp tục |
| 15 | Giữ cùng chuỗi C1 qua lỗi đầu tới lần đuổi tổng 14 | StartPly không reset, không hòa chen vào; lỗi 2 xử Đỏ thua tại ply 27 | N hai lỗi + H thuật toán |
| 16 | Đỏ Pháo a1, Đen Pháo h1, ngòi Đỏ Tốt d1; vòng a1-b1, h1-g1, b1-a1, g1-h1 hai lần | Hai bên cùng đuổi, đều có thể ăn đối phương; hòa 3 theo quy ước đã duyệt, không quy lỗi cho người đi cuối | H đồng thời |
| 17 | Hai Xe a1/h4 đi vòng a1-b1, h4-g4, b1-a1, g4-h4 hai lần | Không đuổi, hòa 3 như test R1 | G |
| 18 | Cửa sổ ba lần lặp có một nước đổi mục tiêu hoặc một lượt không đuổi; fixture khác có thêm mục tiêu nhưng cặp gốc không đứt | Cửa sổ đầu không quy “liên tục cùng cặp”; fixture sau vẫn hoãn | H |
| 19 | B4: Tướng c2-b2; Sĩ b3; Tốt Đen a3,c3,b4, toàn bộ mở | Miễn đúng cặp, không ghi lỗi dù đã ở count 6; các Tốt còn nước nên không tự xử thua toàn bên | N tồn tại ngoại lệ + H nghĩa cụ thể |
| 20 | Ca 19 thêm Tốt Đen b1; hoặc dùng Pháo có ngòi có thể bị quân khác dời/ăn | Có phản hồi cứu bằng quân khác nên không miễn | H |
| 21 | Ca 19 thêm quân úp h4; hoán đổi danh tính h4 | Không kết luận “必死”; warning/counter hai bố cục giống nhau | H + G công bằng |
| 22 | C1 counter ép biên 59, b2-c2 | Counter 60 thật, tạo hold cho Đỏ; không tự reset xuống 0 | H tương tác 60 |
| 23 | Sau ca 22, Đỏ tiếp cặp; fixture khác đổi cặp/đi không đuổi; fixture khác ăn/lật | Tiếp thì giữ hold tới xử phạt; bỏ bằng nước yên thì hòa 60, không gia hạn với cặp mới; ăn/lật reset thật | H |
| 24 | 60 quiet ply không đuổi bằng hai đường chu kỳ 8/10 của test R1 | Hòa đúng ply 60, không thành 120; test hồi quy vẫn đúng | G |
| 25 | Lặp và 60 đồng thời, có/không một bên đuổi liên tục; thêm fixture lỗi 2 | Không đuổi: lặp ưu tiên 60; đuổi: áp C2 rồi C3; lỗi 2 ưu tiên mọi hòa | G thứ tự cũ + H mở rộng |
| 26 | Bàn không còn nước đối phương sau nước đi yên; hoặc nước ăn quân cuối khi đang count 6 | B4/ưu tiên thắng xử đúng; ăn không bị coi là lần đuổi 7 | G + H |
| 27 | Invalid/out-of-turn/extra fields khi count 6 hoặc đang hold | Deep equality toàn state/counters/IDs/hold; không tăng lỗi, không mất warning hợp lệ | G + H |
| 28 | Hai private layout úp khác nhau, cùng lịch sử lật/đi công khai; thêm getter ném lỗi nếu đọc hidden type/color | Cùng public/legal/warning/phân xử; không đọc bí mật để xét chase | G + H |
| 29 | Hai quân cùng màu/loại đổi chỗ; theme/hướng đổi; bản sao JSON của state | Khóa lặp không chứa visibleId/UI; ID chạy theo quân qua JSON; counter không đổi khi chỉ đổi UI | G + H |
| 30 | Sau lỗi 1, đổi Ngang/Dọc/Sáng/Tối; hủy Ván mới; đồng ý Ván mới | Giữ lỗi/chuỗi khi đổi UI/hủy; reset hết ở ván mới | H + G UI |
| 31 | Snapshot/event/warning bị sửa từ UI hoặc public object con bị mutate | Không sửa private, không qua mặt applyAction; không có ID/quân úp trong DOM/log | G + H |
| 32 | Sau lỗi 2: mọi player/action; keyboard/click trên bàn | `GAME_OVER`, không event mới, result/counter/bàn bất biến; thông báo lý do thua rõ | G khóa ván + H reason mới |

Không thay các test lặp/60 không có đuổi thành kỳ vọng mới chỉ để có xanh. Chỉ các fixture thực sự thuộc nhánh house rule đã duyệt mới được cập nhật assertion, kèm giải thích. Giữ ma trận luật ăn và các kiểm tra công khai/bí mật.

## F. Phê duyệt và bước triển khai kế tiếp

### F1. Ba quyết định nghiệp vụ đã chốt ở prompt R2-03A

1. **Đã duyệt B1–B3:** đếm mọi cặp do chính quân vừa đi đe dọa; lần 7 một lỗi, hai lỗi thua; lỗi đầu giữ nước/chuyển lượt, reset count nhưng giữ cặp/start; không cấm nước lỗi, invalid không tính lỗi kỹ thuật.
2. **Đã duyệt B4:** chỉ toàn bàn mở và không một phản hồi cơ bản hợp lệ nào cứu mục tiêu khỏi chính quân đuổi ngay lượt tiếp theo; xét cả cứu bằng quân khác, không tìm kiếm nhiều ply.
3. **Đã duyệt C2–C4:** lỗi 2 trước thắng/hòa; hoãn lặp khi đúng một bên đuổi liên tục trên cả cửa sổ; hai bên cùng đuổi được hòa; 60 có hold cố định, dừng mọi cặp hold bằng nước yên giải phóng hòa, không gia hạn/chuyển trách nhiệm.

Không còn quyết định nghiệp vụ nào trong ba mục này chờ duyệt. R2-03A thực thi engine theo đúng phạm vi; không tự mở rộng sang UI.

### F2. Một kế hoạch thực thi, tách engine/test rồi UI

Hai phần được tách thành prompt độc lập:

1. **R2-03A đã thực hiện:** engine/test/tài liệu, helper chung luật ăn, ID/runs/lỗi/ba mốc/hold, giữ API/action/event. Không solver/Bot/server/framework.
2. **Bước kế tiếp duy nhất được đề xuất: R2-03B**, nối warning/lỗi/result từ public vào UI và kiểm tra Chrome PC/Mobile, keyboard/chuột/touch, hai theme/hướng. Chưa sửa controller/HTML/CSS hoặc suite trình duyệt cho tính năng mới trong R2-03A.

Không hứa khôi phục chase history cho state cũ không lưu metadata. Nếu cần tương thích dữ liệu R1/R2 fixture, mặc định bắt đầu lịch sử biết được tại state đó và ghi rõ; ván Offline mới sau reload không cần migration/save. Không thêm tính năng ngoài phạm vi để phục vụ test.

## Bằng chứng hoàn thành R2-02

- Trước thay đổi tài liệu: chạy thật `node --test --test-reporter=spec tests/engine.test.cjs tests/endgame.test.cjs tests/mapping.test.cjs tests/browser.test.cjs tests/gameplay.test.cjs`: **213/213 PASS**, 0 fail, 0 skipped. Bao gồm HTTP/Chrome và 16 tổ hợp viewport/theme/hướng trong mỗi suite browser. Log local: `.local-qa/r2-01/r2-02-baseline-test.txt` (ignored).
- `git diff --check` và kiểm tra whitespace ba file mới R2-01 không có lỗi. Rà soát/stage allowlist đúng 10 file rồi tạo đúng một checkpoint R2-01 `d0509c3`; không stage prompt, secret hoặc QA artifact. Checkpoint R0–R1 vẫn giữ nguyên.
- Có thêm phép tái hiện read-only tám nước C1 bằng Node, kiểm tra 13 nước đuổi qua các ô mới, vòng hai Pháo và các phản hồi cứu Sĩ của B4 bằng luật hiện có. Phép kiểm tra phát hiện ví dụ cứu bằng Xe là sai thứ bậc; bản cuối dùng Tốt b1 ăn Tướng b2, đã kiểm tra lại thành công. Không đổi test/runtime và **không cộng các phép kiểm chứng tọa độ này vào số 213 test**. Chưa triển khai hay chạy ma trận chase tương lai ở E.
- R2-02 chỉ tạo tài liệu này và cập nhật trạng thái chờ chốt trong `docs/SPEC.md`; không sửa engine, gameplay, CSS, HTML, test, `.gitignore`, prompt hoặc secret. Không push/deploy/Online/Bot/SVG/Supabase/iChess.

## Bằng chứng hoàn thành R2-03A

**265/265 PASS: 213 hồi quy + 52 test mới trong `tests/chase.test.cjs`, không fail/skip.** Mốc trung gian 264/264 gồm 51 test mới; ca bổ sung thứ 52 dùng các nước thật để hai Xe cùng loại đổi chỗ, chứng minh ID bám quân nhưng khóa lặp không chứa ID. Không thay đổi phạm vi triển khai.

| Mục E | Bằng chứng engine/test |
| --- | --- |
| 1–8 | C1 và đường đuổi không lặp; ma trận đe dọa Tướng/Sĩ, Tốt/Tướng, Mã/Pháo; Pháo ngòi đỏ/đen/úp, 0/1/2 ngòi, đích úp/đồng minh; dời ngòi cho Pháo khác không tính đuổi. |
| 9–12 | ID theo lật và qua chuyển ô; hai quân cùng loại; đổi A/B; nhiều cặp độc lập, một action tối đa một lỗi/reset cả count chưa tới 7; lật/ăn của cả hai bên, ID đã ăn không tái dùng. |
| 13–15 | C1 thật đủ 27 ply: 8 hoãn, 13 lỗi 1, 27 lỗi 2; đối xứng người/màu; kiểm tra warning so với applyAction cho mọi action cơ bản trước cả hai lỗi. Phần click/keyboard/touch hiển thị warning chờ R2-03B. |
| 16–18 | Hai Pháo cùng đuổi hòa; vòng không đuổi hồi quy giữ nguyên; đe dọa rời rạc không đủ cửa sổ; thêm đích tạm không ngắt cặp gốc; bỏ đuổi ở thế mới không tự phát hòa lặp tồn kho. |
| 19–21 | B4 Tướng/Sĩ bị chặn; Xe b1 không cứu, Tốt b1 cứu; Pháo có thể cứu bằng quân khác dời ngòi; có ô úp không miễn; mục tiêu được bảo vệ vẫn tính. |
| 22–25 | Counter 59→60 thật trong fixture ép biên; hold cố định, giao cặp thu hẹp, không thêm lại/chuyển người; ngừng/đổi cặp hòa ngay; ăn/lật reset; cùng đuổi hòa 60; lỗi 1 vẫn ghi trước hòa, lỗi 2 ưu tiên lặp/60 đồng thời. Hồi quy 60 nước thật không đuổi giữ nguyên. |
| 26 | Ăn quân cuối ngắt đuổi không ghi lỗi; hết nước trên bàn mở được miễn B4 và thắng. Lỗi 2 đồng thời thắng từ cặp đó không tự nhiên khả đạt theo C4; không dựng kết quả giả để tuyên bố đã chơi được ca này. |
| 27–29 | Invalid bất biến toàn metadata; hoán đổi quân úp qua 27 ply cho cùng legal/public/warnings/hold/result; getter hidden type/color ném lỗi kiểm tra public/warning/legal; JSON/đổi ID/UI metadata không đổi khóa; last-three tối đa 3. |
| 30–32 | Ván mới reset engine; legacy không bịa quá khứ; public/event/metadata clone sâu, public giả không qua mặt engine; sau lỗi 2 mọi legal rỗng, mọi action GAME_OVER. Hiển thị/confirm/đổi theme/hướng cho trạng thái chase mới chờ R2-03B. |

Chỉ cập nhật **bốn assertion schema** trong hồi quy: `engine.test.cjs` bổ sung các key private lúc tạo ván, `chase` public ban đầu và `visibleId` trên quân mở; `endgame.test.cjs` bổ sung key `chase` trong allowlist public finished. Không sửa kỳ vọng thắng/hòa, không đổi fixture lặp/60 cũ, không xóa/skip/nới assertion hoặc sửa browser/gameplay test.

Lệnh kiểm tra:

```text
node --test --test-reporter=spec tests/engine.test.cjs tests/endgame.test.cjs tests/chase.test.cjs tests/mapping.test.cjs tests/browser.test.cjs tests/gameplay.test.cjs
node --check js/engine.mjs
node --check tests/engine.test.cjs
node --check tests/endgame.test.cjs
node --check tests/chase.test.cjs
git diff --check
```

Chrome hồi quy giữ các tổ hợp 320×568, 390×844, 768×1024, 1280×800 × Sáng/Tối × Ngang/Dọc; ván UI đủ 32 quân vẫn kết thúc sau 83 hành động với `all_pieces_captured`. R2-03A không kiểm chứng hiển thị UI trường tróc mới: controller chưa có warning/lỗi và chưa ánh xạ reason mới (có thể hiện `undefined` ở lời giải thích kết quả). Bốn export, action/event cũ giữ nguyên; getter/hoán đổi quân úp và kiểm tra DOM công khai đều PASS. Offline vẫn không chống soi bộ nhớ DevTools.

Git: `main` ahead `origin/main` 2 commit, HEAD giữ `d0509c3`; không stage/commit/push/deploy, không đọc secret. Bảy file trong phạm vi engine/unit test/tài liệu được giữ trên working tree; hai tài liệu R2-02 có sẵn được cập nhật tiếp, không reset/undo. Không phát hiện phản ví dụ C2/C3 trong các ca đã kiểm chứng. Không còn blocker trong phạm vi R2-03A. **Bước tiếp theo duy nhất được đề xuất là R2-03B — nối warning/lỗi/kết quả vào UI và kiểm tra Chrome PC/Mobile**, chưa thực hiện.

## Bằng chứng R2-03C — hòa sau khi ngắt rồi đuổi lại

### Tái hiện và nguyên nhân trước thay đổi

Baseline R2-03B **273/273 PASS**. Không có biên bản ván người dùng; dưới đây là **fixture suy luận tương đương**, không khẳng định chính là ván đã báo. Đỏ: Tượng b1, Sĩ g1; Đen: Mã b3, Sĩ a4; 28 quân vắng mặt đưa vào captured đúng cơ cấu. Đỏ đi trước, không đặt sẵn kết quả, fault, quiet hoặc tần suất. Các nước đều chạy qua `applyAction` thật. Sĩ Đen chỉ làm nước chờ để phục hồi cùng bố cục công khai.

Trên engine R2-03A, thế sau ply 21 trùng các thế ở **ply 1 và 5**, cùng lượt Đen và ánh xạ màu. Tượng đã ngắt run ở ply 19; run mới bắt đầu 21, count 1. Cửa sổ ba lần cũ `(1,21]` yêu cầu Đỏ đuổi liên tục từ lượt riêng đầu là ply 3; `startPly=21` không thỏa. Vì thế engine xử `draw / threefold_repetition`. **Đúng đặc tả C2 cũ, không phải lỗi luật ăn, đếm sai ply hoặc phạt Mã đang chạy.** Đề xuất R2-03C thay đổi cách đủ điều kiện của lần lặp.

Test mới đã FAIL trên code cũ đúng tại assertion `status === playing` ở ply 21, rồi PASS sau thay đổi. Diagnostic trong test ghi toàn bộ action, `turn`, hai counter, `drawDeferred`, runs gồm ID/tọa độ/count, faults và result qua từng nước. Bảng rút gọn dưới đây dùng ID quan sát `v1` cho Tượng, `v3` cho Mã. Run của Đen luôn `[]`, faults luôn `[0,0]`; “—” ở run Đỏ là `[]`, số n là cặp `(v1,v3,count=n)`. Hai bộ đếm trước mốc 19 bằng nhau.

| Ply | Nước | Lượt tiếp | `repetitionCount` | `drawRepetitionCount` mới | Run Đỏ | `drawDeferred` | Kết quả cũ → mới |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | Khởi tạo | Đỏ | 1 | 1 | — | [] | Chơi → chơi |
| 1 | Tượng b1–b2 | Đen | 1 | 1 | 1 | [] | Chơi → chơi |
| 2 | Mã b3–c3 | Đỏ | 1 | 1 | 1 | [] | Chơi → chơi |
| 3 | Tượng b2–c2 | Đen | 1 | 1 | 2 | [] | Chơi → chơi |
| 4 | Mã c3–b3 | Đỏ | 1 | 1 | 2 | [] | Chơi → chơi |
| 5 | Tượng c2–b2 | Đen | 2 | 2 | 3 | [] | Chơi → chơi |
| 6 | Mã b3–c3 | Đỏ | 2 | 2 | 3 | [] | Chơi → chơi |
| 7 | Sĩ g1–h1 | Đen | 1 | 1 | — | [] | Chơi → chơi |
| 8 | Sĩ a4–b4 | Đỏ | 1 | 1 | — | [] | Chơi → chơi |
| 9 | Tượng b2–c2 | Đen | 1 | 1 | 1 | [] | Chơi → chơi |
| 10 | Mã c3–b3 | Đỏ | 1 | 1 | 1 | [] | Chơi → chơi |
| 11 | Tượng c2–b2 | Đen | 1 | 1 | 2 | [] | Chơi → chơi |
| 12 | Mã b3–c3 | Đỏ | 2 | 2 | 2 | [] | Chơi → chơi |
| 13 | Tượng b2–c2 | Đen | 2 | 2 | 3 | [] | Chơi → chơi |
| 14 | Mã c3–b3 | Đỏ | 2 | 2 | 3 | [] | Chơi → chơi |
| 15 | Tượng c2–b2 | Đen | 2 | 2 | 4 | [] | Chơi → chơi |
| 16 | Mã b3–c3 | Đỏ | 3 | 3 | 4 | Hoãn lặp, Đỏ | Chơi → chơi |
| 17 | Tượng b2–c2 | Đen | 3 | 3 | 5 | Hoãn lặp, Đỏ | Chơi → chơi |
| 18 | Mã c3–b3 | Đỏ | 3 | 3 | 5 | Hoãn lặp, Đỏ | Chơi → chơi |
| 19 | **Sĩ h1–g1 ngắt chuỗi** | Đen | 1 | 1 | — | [] | Chơi → chơi |
| 20 | Sĩ b4–a4 | Đỏ | 2 | **1** | — | [] | Chơi → chơi |
| 21 | **Tượng c2–b2 đuổi lại** | Đen | 3 | **1** | 1 | [] | **Hòa lặp → chơi** |

Ply 7 ngắt một run nhưng chưa từng có hoãn hòa nên không mở mốc mới. Ply 19 chấm dứt đoạn đã hoãn ở 16–18 nên mở mốc 19. `noProgressPly` vẫn bằng số ply thật từ 0 đến 21; không lỗi kỹ thuật nào bị tạo/xóa. Vị trí sau ply 19 là lần đầu trong giai đoạn mới; tại 21 chỉ có một lần đủ điều kiện, dù tần suất lịch sử vẫn là 3.

### Bất biến và kiểm thử

Thêm **17 test unit** vào `tests/chase.test.cjs`; tổng chase **69** (14 ca đã có trước lượt tiếp tục, 3 ca bổ sung khi rà soát cuối). Bao phủ:

- Chuỗi suy luận 21 ply phía trên và cả dữ liệu trace. Sau đó nếu tiếp tục cùng Tượng–Mã: lỗi đầu ở 33, lỗi hai ở 47; Đen chạy không nhận lỗi. C1 gốc vẫn giữ các mốc 8/13/27.
- Từ mốc ngắt 19, hai Sĩ đi vòng chờ: ba lần **mới** của cùng thế ở 19/23/27 hòa tại 27. Không cấm hòa vĩnh viễn; bảng tần suất/mốc vẫn còn.
- Năm vòng đuổi–ngắt, mỗi vòng 12 action hợp lệ: phase đổi ở 9/21/33/45/57 nhưng quiet vẫn tăng đến **60 và hòa đúng 60**. Thế cuối có tần suất lịch sử 16, đủ điều kiện mới 1, xác nhận kết thúc do 60.
- Chạy thật 48 nước đuổi–ngắt rồi 12 nước đuổi liên tục để tạo hold tại **60**. Sĩ ngắt, đổi quân A hoặc đổi mục tiêu B tại **61** đều giải phóng hold và hòa 60, không gia hạn bởi phase mới. Nếu tiếp tục cùng cặp: lỗi đầu 61, lỗi hai 75; hold và counter giữ nguyên.
- Lỗi đã nhận không mất sau ngắt; tiếp tục đuổi đủ bảy lần nữa vẫn thua lỗi hai. Hai cặp làm căn cứ hoãn chỉ thu hẹp: mất một cặp hoặc một nước chạy không tự mở phase, mất hết mới mở.
- Ăn/lật reset quiet theo luật thật và giữ lỗi/lịch sử; invalid, JSON, UI metadata, public giả và clone sâu không thay thẩm quyền. Hoán đổi hidden identity qua 21 ply cho cùng public/legal/kết quả; getter hidden ném lỗi không bị đọc để tính public. Legacy đang hoãn có chứng cứ hiện tại nhận diện được; game over và Ván mới vẫn chuẩn.
- Đổi độc lập người đuổi và màu quân vẫn giữ mốc mới 19, tiếp tục chơi ở 21, lỗi tại 33/47; người chạy không nhận lỗi. Ngắt run trước khi có hoãn (ply 7) không mở mốc mới.
- Sau khi một bên đã hoãn rồi ngắt tại 9, hai Pháo cùng đuổi liên tục: các lần xuất hiện mới 9/13/17 vẫn hòa tại 17, không bên nào nhận lỗi.
- Cặp hoãn bị loại rồi trở lại không được thêm lại vào tập căn cứ. Khi cặp còn lại chấm dứt tại 15, mở mốc mới dù cặp đã trở lại còn run; lỗi đầu tại 13 vẫn giữ, quiet vẫn là 15. Count của cặp trở lại bằng 1 tại 15 vì lỗi đầu reset mọi count ở 13; startPly vẫn là 13.

**290/290 PASS = 273 hồi quy + 17 mới**, không fail/skip. Gồm 217 unit test Node và 73 test Chrome (tính cả hai test cha như baseline 273). Các assertion cũ về thắng/hòa không đổi. Chỉ ba assertion schema được bổ sung (key private lúc tạo ván, public ban đầu, public finished) và fixture giả lập legacy xóa thêm hai trường R2-03C để thực sự là state cũ. Không xóa/skip/nới test nền để đạt PASS.

Lệnh full Node/Chrome và `node --check` ở RULES/README; `git diff --check` PASS. Chrome HTTP giữ toàn bộ kiểm tra PC/Mobile 320×568, 390×844, 768×1024, 1280×800 × Sáng/Tối × Ngang/Dọc, chuột/touch/bàn phím, DOM công khai và ca C1. Không sửa UI/test UI trong R2-03C: UI đã dùng `drawDeferred` và result authoritative, không đọc tần suất lịch sử để tự kết thúc. `repetitionCount` không đổi nghĩa; trường `drawRepetitionCount` được bổ sung cho người tiêu thụ API.

Giới hạn: chưa có biên bản để xác minh chính xác ván người dùng; chưa kiểm tra điện thoại/trình đọc màn hình thật. State legacy đã ngắt trước khi nhập, không còn chứng cứ đang hoãn tại vị trí hiện tại và không có metadata mới thì không thể bịa lại mốc giai đoạn quá khứ. Không thêm replay/migration. Không thấy phản ví dụ phá bất biến C2.1/C3 trong phạm vi đã kiểm chứng.

Giữ toàn bộ bảy file R2-03B dirty; R2-03C chỉ sửa engine/unit test và ba tài liệu RULES/CHASE_RULE_DESIGN/SPEC. HEAD vẫn `8edc566`, `main` ahead 3; không stage/commit/push/deploy, không đọc/sửa secret hoặc mở rộng SVG/âm thanh/R2-04.

### Nghiệm thu lượt tiếp tục ngày 14/11/2026 — PASS

Tiếp tục từ working tree đang có, không chạy lại triển khai hoặc dựng lại baseline 273. Lần kiểm tra đầu xác nhận **287/287 PASS** của trạng thái tiếp nhận. Rà soát diff engine, B2/C2/C3/C4 và các phản ví dụ chưa thấy vi phạm bất biến; không cần sửa engine thêm. Chỉ bổ sung ba test trên và hoàn thiện biên bản trong CHASE_RULE_DESIGN/SPEC. Một assertion mới ban đầu kỳ vọng count 2 đã được sửa thành 1 để đúng quy tắc lỗi đầu reset mọi count tại ply 13; giữ thêm assertion startPly và lỗi để kiểm chứng, không đổi luật.

- Lần full cuối: **290 pass, 0 fail, 0 skipped, 0 cancelled, 0 todo** trên Node `v22.19.0`, Chrome HTTP `157.0.8103.51`. Log: `.local-qa/r2-03c-review-20261114-004340-5e97b680/final-full-test-2.txt`.
- `node --check` toàn bộ **11 file JS/MJS/CJS** trong `js/` và `tests/` PASS; `git diff --check` PASS. Log kiểm tra và dấu SHA-256 đầu/cuối được giữ trong cùng thư mục QA mới, không ghi đè bằng chứng trước.
- Chrome regression: `.local-qa/r2-01/regression/run-Sa6CVO/`; gameplay: `.local-qa/r2-01/gameplay/run-2SgAD7/`. Hai `report.json` đều có `browserErrors: []`; mỗi suite kiểm tra đủ 16 tổ hợp PC/mobile giả lập. C1, hold 60, chuột/touch/bàn phím, DOM công khai, Ván mới và game over PASS. Ván đầy đủ 32 quân vẫn kết thúc sau 83 hành động UI.
- Git cuối vẫn **13 modified, 18 untracked**, không staged; `main` ahead `origin/main` 3, HEAD `8edc566`. Cả 18 untracked (ZIP và tài nguyên SVG/tài liệu đi kèm) giữ nguyên nội dung theo SHA-256.
- Phần R2-03C đang nằm trong 7 file: `js/engine.mjs`, `tests/chase.test.cjs`, `tests/engine.test.cjs`, `tests/endgame.test.cjs`, `docs/RULES.md`, `docs/CHASE_RULE_DESIGN.md`, `docs/SPEC.md`. Sáu file modified còn lại được kế thừa nguyên trạng: `README.md`, `index.html`, `js/offline.mjs`, `style.css`, `tests/gameplay.test.cjs`, `tests/helpers/chrome.cjs`. Riêng lượt tiếp tục chỉ đổi `tests/chase.test.cjs`, `docs/CHASE_RULE_DESIGN.md`, `docs/SPEC.md`.

Không còn việc triển khai hoặc kiểm tra bắt buộc dang dở trong phạm vi R2-03C. Giới hạn vẫn là fixture suy luận thay cho biên bản ván thật, thiết bị mobile giả lập, chưa Safari/Firefox/trình đọc màn hình thật và không khôi phục metadata giai đoạn đã mất của state legacy. Không reset/undo/clean, không sửa UI/SVG/âm thanh/Online/Bot, không stage/commit/push/deploy và không truy cập secret.
