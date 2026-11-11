# The Bếp Teahouse Inventory

Dashboard quản lý và app nhân viên cho Android/iOS dùng chung API Node.js và SQLite cho Duluth, Johns Creek, Norcross, Kho DL House và Kho Extra.

## Dùng dữ liệu lấy từ Google Sheets

Trên máy đã nhập dữ liệu, nhấp đúp `Mo-The-Bep.cmd` để mở [trang đăng nhập chung](http://127.0.0.1:4171/). App mở giao diện quản lý hoặc nhân viên theo tài khoản đã đăng nhập. File `data/inventory-logins.json` chứa mật khẩu ban đầu của từng tài khoản, chỉ mở và cấp tài khoản cho đúng người. Sau khi quản lý đổi mật khẩu, hãy dùng mật khẩu mới. Nhấp đúp `Mo-The-Bep-Android.cmd` để app debug kết nối với cùng backend.

Số dư khởi đầu là bản chụp chỉ đọc từ [The Bep Inventory JC & Duluth](https://docs.google.com/spreadsheets/d/17HM8yPfOMDpZdvSe46a8_9M3kJlKwurJVfe1eAatucg/edit). File `data/inventory.sqlite` giữ tồn và giao dịch mới. Các dòng `NOT COUNTED` hiện là **Chưa biết**. Quản lý có thể chọn **Bổ sung đơn vị** cho mặt hàng thiếu đơn vị trong danh mục nguồn. Chỉ quy đổi tự động khi quy cách ghi rõ số lượng và đơn vị đích khớp với đơn vị tồn. Quy cách chưa rõ vẫn được hiện dưới tên mặt hàng để đối chiếu. Ngưỡng riêng từng địa điểm và đơn giá USD để trống khi nhập.

- **Tồn kho toàn hệ thống.** Khi quản lý chọn **Tất cả địa điểm**, mỗi mặt hàng có một dòng với tổng ở cột **Đang có**. Tổng ghi **Tạm tính** khi một số địa điểm chưa biết số dư. Chọn từng địa điểm để xem chi tiết, kiểm kê hoặc đặt ngưỡng.
- **Kiểm kê cuối tuần.** Vào **Phiếu kiểm kê**, chọn nhóm hàng, nhập số tổng cho từng mặt hàng đã đếm và tên người đếm. Ô trống giữ tồn, số `0` xác nhận hết hàng. Khi tải lại trên cùng thiết bị, ứng dụng mở lại nhóm còn nháp của người dùng tại địa điểm kiểm kê. Chọn **Kiểm tra và gửi** để xem và gửi tất cả nhóm đã đếm tại địa điểm đó trong một lần xác nhận. Mỗi nhóm vẫn có phiếu riêng. Nếu gián đoạn, các nhóm chưa được xác nhận vẫn giữ nháp. Lịch sử phiếu hiện số trước, số thực đếm, chênh lệch và người gửi.
- **Tìm và phân trang.** Tìm theo tên, mã nội bộ hoặc SKU trong các danh sách mặt hàng. Mỗi trang hiện tối đa 20 dòng.
- **Quyền nhân viên.** Nhân viên nhập và gửi phiếu kiểm kê, lập phiếu chuyển từ địa điểm được cấp và xác nhận hàng do quản lý gửi đến địa điểm đó.
- **Đổi mật khẩu nhân viên.** Quản lý mở **Tài khoản**, chọn đúng địa điểm và bấm **Đổi mật khẩu**. Dùng mật khẩu mới dài ít nhất 12 ký tự. Khi lưu, tất cả phiên đăng nhập của tài khoản đó bị thu hồi và nhân viên cần đăng nhập bằng mật khẩu mới.
- **Xác nhận hàng đến.** Nhập tên người nhận trước khi xác nhận. Nếu đủ, chọn **Xác nhận nhận đủ toàn bộ hàng** để nhận phần còn chờ trong một lần. Nếu thiếu, xác nhận từng dòng theo thực tế. Với hàng đã nằm trong số đếm, quản lý đợi phiếu kiểm kê được gửi rồi chọn **Đã tính trong phiếu** ở dòng tương ứng.
- **Chuyển kho.** Tìm và đánh dấu nhiều mặt hàng rồi bấm **Thêm mặt hàng đã chọn** một lần. Nhập số lượng cho từng dòng và xác nhận xuất. Phiếu nhiều dòng được lưu và trừ tồn trong cùng giao dịch.
- **Báo cáo tuần.** Tuần bắt đầu thứ Hai theo giờ Atlanta. Với từng mặt hàng tại từng địa điểm, cuối kỳ là phiếu kiểm kê cuối cùng đã gửi trong tuần được chọn. Đầu kỳ là phiếu ngay trước đó, kể cả khi hai phiếu cùng tuần hoặc có tuần bỏ kiểm kê. Bản chụp Sheet có thể làm mốc mở đầu kỳ đầu tiên. Báo cáo hiển thị thời điểm của hai mốc và tính tiêu hao từ các giao dịch giữa hai mốc. Dòng thiếu mốc hiển thị “—”. Quản lý nhập đơn giá USD theo đơn vị tồn ở **Báo cáo tuần**. Tổng giá trị tồn hiện tại là tạm tính nếu còn hàng chưa biết số dư hoặc chưa có giá.

Nếu cần nhập lại từ bản chụp để thử nghiệm, chạy `node scripts/import-opening.mjs <snapshot.json> <sqlite-moi> <logins-moi.json>`. Lệnh chỉ chấp nhận đường dẫn đầu ra mới để bảo vệ số dư đang sử dụng. Để mở riêng bộ dữ liệu mẫu, chạy `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\open-demo.ps1 -Demo`. Thêm `-Demo` vào `scripts/run-android-local.ps1` để nối app debug vào dữ liệu mẫu.

## Chạy backend và web

Trên Windows, `Mo-The-Bep.cmd` mở dữ liệu mẫu nếu chưa có `data/inventory.sqlite`. Dùng VS Code để mở thư mục dự án và sửa code.

Cần Node.js 24 trở lên. Mở terminal tại thư mục chứa README và chạy:

```sh
node server/http.mjs
```

| Giao diện | Địa chỉ mặc định |
| --- | --- |
| Đăng nhập quản lý và nhân viên | [http://127.0.0.1:4170/](http://127.0.0.1:4170/) |
| Kiểm tra API | [http://127.0.0.1:4170/api/health](http://127.0.0.1:4170/api/health) |

Backend và web chạy cùng tiến trình. Dữ liệu lưu tại `data/demo.sqlite` và được giữ lại khi khởi động lại. Dùng `BEP_DB` để chọn file SQLite khác, `BEP_PORT` để đổi cổng và `BEP_HOST` để đổi địa chỉ lắng nghe. Chọn đường dẫn SQLite mới để bắt đầu một lượt demo sạch. Trên máy Codex Windows có thể dùng Node đi kèm nếu `node` chưa có trong PATH:

```powershell
$node = "$env:USERPROFILE/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe"
& $node server/http.mjs
```

Để thử giao diện trên điện thoại cùng mạng Wi-Fi, dừng tiến trình đang chạy rồi đặt `BEP_HOST=0.0.0.0` trước khi khởi động lại. Trên Windows dùng `$env:BEP_HOST = '0.0.0.0'`. Trên điện thoại mở `http://<IP-LAN-của-máy-chạy-backend>:4170/`. Chỉ sử dụng chế độ HTTP với dữ liệu mẫu trong mạng riêng.

## Chạy app Android và iOS

### Thử nhanh Android trên Windows

Cần Android Studio, Android SDK Platform 36, Build-Tools và Platform-Tools. Nhấp đúp `Mo-The-Bep-Android.cmd` để build và mở app. Nếu máy đã có AVD `Bep_API_36`, lệnh tự mở máy ảo khi chưa kết nối thiết bị nào. Bạn cũng có thể mở một máy ảo khác trong **Device Manager** hoặc kết nối điện thoại Android đã bật USB debugging. Để chạy cùng thao tác bằng PowerShell, dùng lệnh dưới đây.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-android-local.ps1
```

Lệnh tạo APK debug, nối cổng backend qua USB/ADB và mở app trên thiết bị. App debug tải giao diện trực tiếp từ backend trên máy tính, nên sửa giao diện xong có thể mở lại app để xem thay đổi. Truyền `-BuildOnly` để chỉ tạo APK hoặc `-Serial <adb-device>` khi đang kết nối nhiều thiết bị.

Launcher dùng chế độ đồ họa phần mềm cho `Bep_API_36` để chạy ổn định trên máy Windows đã thiết lập. Lần khởi động máy ảo có thể mất vài phút. Nếu máy ảo đang chạy, launcher dùng thiết bị đang kết nối.

### Bản native dùng backend HTTPS

Dự án Capacitor nằm trong `android/` và `ios/`. Bản native đóng gói giao diện nhân viên và cần một địa chỉ **HTTPS** của cùng backend mà thiết bị truy cập được. Trên mạng thử nghiệm riêng có thể dùng reverse proxy chuyển tiếp HTTPS vào `127.0.0.1:4170`. Dùng chứng chỉ được thiết bị tin cậy và giữ endpoint demo trong phạm vi mạng thử nghiệm. API mặc định cho phép origin `https://localhost` của Android và `capacitor://localhost` của iOS. Nếu đặt `BEP_ORIGINS`, truyền danh sách origin cách nhau bằng dấu phẩy và giữ hai origin này khi dùng cả hai nền tảng.

```sh
npm install
npm run build:mobile -- https://inventory.example.com
npx cap sync android
npx cap open android
```

Thay `https://inventory.example.com` bằng origin thật của backend trước khi chạy. Trong Android Studio, chọn máy ảo hoặc điện thoại rồi bấm **Run**. Trên macOS, chạy hai lệnh đầu ở trên rồi mở dự án iOS bằng:

```sh
npx cap sync ios
npx cap open ios
```

Trong Xcode, chọn simulator hoặc cấu hình **Signing & Capabilities** khi chạy trên iPhone thật, rồi bấm **Run**. Dự án dùng Swift Package Manager và yêu cầu iOS 15.4 trở lên. Sau khi sửa giao diện hoặc đổi địa chỉ API, chạy lại `build:mobile` và `cap sync` cho nền tảng tương ứng. Xem phiên bản Xcode và Android Studio yêu cầu trong [tài liệu môi trường Capacitor 8](https://capacitorjs.com/docs/getting-started/environment-setup).

## Tài khoản và dữ liệu mẫu

Mật khẩu chung cho tài khoản mẫu là `BepDemo2026!`. Các tài khoản này dùng cho môi trường demo riêng.

| Tài khoản | Quyền |
| --- | --- |
| `manager` | Xem, thao tác và đặt ngưỡng tại cả năm địa điểm |
| `duluth` | Thao tác tại Duluth |
| `johns-creek` | Thao tác tại Johns Creek |
| `norcross` | Thao tác tại Norcross |
| `dl-house` | Thao tác tại Kho DL House |
| `extra` | Thao tác tại Kho Extra |

| Mặt hàng | Đơn vị tồn | Quy đổi mẫu |
| --- | --- | --- |
| Trà xanh | túi | 1 thùng = 12 túi |
| Trân châu | túi | 1 thùng = 6 túi |
| Ly 23 oz | cái | 1 túi = 50 cái, 1 thùng = 500 cái |

Cấu trúc danh mục, quy cách đóng gói, số dư theo địa điểm và nhật ký tham khảo từ [The Bep Inventory JC & Duluth](https://docs.google.com/spreadsheets/d/17HM8yPfOMDpZdvSe46a8_9M3kJlKwurJVfe1eAatucg/edit). Số dư, ngưỡng và quy đổi trong bảng trên chỉ dùng trong chế độ mẫu.

## Thử ba luồng trên dữ liệu mới

1. **Nhận một phần.** Đăng nhập `manager`, vào **Đơn giao** và mở đơn của Nhà cung cấp mẫu tại Duluth. Xác nhận 5 túi trà xanh trên 12 túi dự kiến. Có thể đính kèm JPG, PNG hoặc WebP tối đa 5 MB. Đơn còn chờ 7 túi và tồn Duluth tăng từ 24 lên 29.
2. **Cảnh báo tồn thấp.** Tại dashboard, đặt ngưỡng trân châu của Norcross là 4 túi. Đăng nhập `norcross` và kiểm kê còn 4 túi thay cho 6. Làm mới dashboard. Dòng Norcross hiện **Sắp hết**, nhật ký ghi −2 túi, người nhập và thời điểm. Ngưỡng trống tắt cảnh báo cho riêng cặp mặt hàng và địa điểm.
3. **Chuyển hàng.** Với `duluth`, xuất 2 túi ly 23 oz sang Johns Creek. Tồn Duluth giảm từ 900 xuống 800 cái và có 100 cái đang đi. Với `manager`, xác nhận Johns Creek nhận 60 cái trước. Johns Creek lên 560 cái và còn 40 cái đang đi. Nhận thêm 30 cái, chọn **Đóng phiếu sau lần nhận này** và ghi lý do thiếu 10 cái. Johns Creek lên 590 cái, đang đi còn 0 và chênh lệch là −10 cái.

Đơn giao và phiếu chuyển đều hỗ trợ nhiều mặt hàng. Khi nhận hàng, có thể xác nhận riêng từng dòng qua nhiều lần hoặc xác nhận đủ toàn bộ phần còn chờ. Kho gửi trừ tồn khi xuất. Kho nhận cộng số thực nhận qua từng lần. Nếu đóng phiếu thiếu hoặc dư, hệ thống lưu chênh lệch và lý do.

## Kiểm thử

```sh
node --test
```

| Kiểm tra | Kết quả |
| --- | --- |
| Nhận 5/12 túi, còn 7 túi, tồn 24 → 29 và ảnh chỉ đọc được đúng quyền | Đạt |
| Kiểm kê bằng và dưới ngưỡng, cảnh báo đúng địa điểm, từ chối kiểm kê trên số dư cũ | Đạt |
| Chuyển 100 ly, thực nhận 60 + 30, tồn đích 500 → 590, ghi thiếu 10 | Đạt |
| Đơn nhiều dòng, quy đổi đơn vị, ảnh lỗi không làm thay đổi tồn | Đạt |
| CORS của hai nền tảng và thu hồi phiên đăng nhập | Đạt |
| Phiếu theo nhóm giữ nguyên ô trống, chấp nhận 0 và kiểm tra dữ liệu đã thay đổi | Đạt |
| Hàng đã tính trong phiếu được ghi nhận một lần trong tiêu hao tuần | Đạt |
| Chrome với dashboard desktop và giao diện nhân viên rộng 390 px, gồm tải và mở ảnh | Đạt |
| Tạo dự án Android/iOS và đồng bộ gói web bằng Capacitor | Đạt |
| Biên dịch APK debug Android và xác minh chữ ký | Đạt |
| Android Emulator API 36, đăng nhập Duluth, đọc 146 mặt hàng đã nhập và mở phiếu nhóm FOOD | Đạt |
| Biên dịch và chạy iOS native bằng Xcode | Chưa chạy |

Suite API dùng cơ sở dữ liệu bộ nhớ, không thay đổi dữ liệu demo. Bài kiểm tra Chrome dùng `scripts/smoke-web.mjs`, cần Playwright và Chromium. Có thể chỉ định đường dẫn qua `BEP_PLAYWRIGHT` và `BEP_CHROME`.

## Cấu trúc mã nguồn

- `server/db.mjs` tạo lược đồ, tài khoản và dữ liệu mẫu. SQLite lưu ảnh, chứng từ, nhật ký và số dư.
- `server/inventory.mjs` thực thi quyền, quy đổi đơn vị, cập nhật tồn và chống lưu trùng.
- `server/http.mjs` phục vụ API và giao diện web.
- `web/` chứa giao diện quản lý và nhân viên. `scripts/build-mobile.mjs` đóng gói giao diện nhân viên cho Capacitor.
- `android/` và `ios/` chứa dự án native. `test/` chứa các bài kiểm thử HTTP.

Các thao tác ghi API dùng bearer token và `Idempotency-Key`. Nếu chưa biết máy chủ đã nhận lần xác nhận hay chưa, gửi lại cùng khóa và payload. Khi một yêu cầu đã được xử lý, máy chủ trả lại kết quả đã lưu. Kiểm kê cũng gửi `revision` của số dư đang xem để tránh ghi đè một lần nhập hoặc xuất vừa xảy ra.
