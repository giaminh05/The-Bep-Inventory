# Hướng dẫn phát triển The Bếp Inventory

## Ngôn ngữ và giao tiếp

- Luôn giao tiếp với người dùng bằng tiếng Việt, kể cả báo cáo tiến độ, giải thích, câu hỏi xin phê duyệt và báo cáo hoàn thành. Chỉ đổi sang tiếng Anh khi người dùng yêu cầu rõ ràng.
- Viết `AGENTS.md`, `PROJECT_CONTEXT.md`, `docs/MIGRATION_PLAN.md` và tài liệu kiểm toán/kế hoạch mới bằng tiếng Việt. Giữ tên framework, file, API, identifier và cú pháp lập trình bằng tiếng Anh khi phù hợp.
- Mã nguồn, tên biến, hàm và API dùng quy ước tiếng Anh. Nội dung giao diện tiếp tục dùng tiếng Việt theo nghiệp vụ hiện có.
- Giải thích quyết định kỹ thuật, rủi ro và bước triển khai bằng tiếng Việt dễ hiểu; phân biệt điều đã xác minh, suy luận từ source và đề xuất.
- Báo cáo sau mỗi mốc có: công việc đã hoàn thành; tính năng đã migrate (nếu có); các file đã thay đổi; kết quả kiểm thử và workflow đã xác minh; tài liệu đã cập nhật; vấn đề/rủi ro còn tồn tại; công việc tiếp theo.

## Bắt đầu mỗi phiên

1. Đọc `PROJECT_CONTEXT.md`, sau đó `docs/MIGRATION_PLAN.md` nếu làm migration; đọc README, `.github/copilot-instructions.md` và hướng dẫn liên quan.
2. Kiểm tra Git status, branch, lịch sử và diff hiện tại. Không coi trạng thái được ghi trong handoff là Git status hiện tại.
3. Đọc mã, schema và test liên quan trước khi sửa. Dùng mã thực tế và bằng chứng chạy thử để xác nhận tính năng.
4. Với yêu cầu lớn, chia thành các tác vụ nhỏ, xác định phụ thuộc, tiêu chí nghiệm thu và kiểm thử. Trình bày các quyết định kiến trúc lớn để người dùng phê duyệt trước khi thực hiện.

## Phạm vi migration đang có hiệu lực

- Người dùng đã yêu cầu kiểm toán và kế hoạch hiện đại hóa Web, Android, iOS; chưa phê duyệt triển khai kiến trúc rebuild.
- Trong giai đoạn đầu chỉ được tạo/sửa `AGENTS.md`, `PROJECT_CONTEXT.md`, `docs/MIGRATION_PLAN.md` và tài liệu audit cần thiết trong `docs/`.
- Chưa sửa source ứng dụng, dependencies, database/schema, native project hay deployment configuration. Không scaffold Next.js/Expo, chạy `cap sync`, `expo prebuild` hoặc triển khai trước khi có phê duyệt thích hợp.
- Đọc trạng thái và chạy kiểm thử trên dữ liệu dùng một lần được phép; không thử thao tác ghi lên database vận hành.
- Phê duyệt tài liệu không tự động phê duyệt production deployment, thay đổi dữ liệu thật hoặc thay đổi chính sách nghiệp vụ.

## Công cụ và quy trình

- Dùng Superpowers khi phù hợp: brainstorming/architecture trước thay đổi lớn, writing-plans cho kế hoạch, systematic-debugging khi gặp lỗi, TDD cho thay đổi hành vi, verification-before-completion trước tuyên bố hoàn thành.
- Dùng subagents cho các phần độc lập khi hữu ích; mỗi tác vụ cần phạm vi và quyền ghi rõ ràng, tránh sửa chung file.
- Áp dụng Vercel React/Next.js best practices khi có source React/Next.js. Dự án hiện tại là JavaScript thuần; không ép quy tắc framework thành lý do rewrite.
- Áp dụng React Native/Expo best practices khi mobile migration đã được duyệt; dùng hướng dẫn thiết kế mobile phù hợp. Không dùng shadcn/ui hoặc DOM như native component.
- Dùng Playwright MCP cho kiểm thử browser liên quan, kết hợp suite Playwright hiện có. Không coi mock Capacitor bridge là bằng chứng native thực.
- Android dùng emulator/thiết bị, ADB và Gradle phù hợp. iOS dùng Xcode, Simulator/thiết bị hoặc runner macOS. Kiểm tra native lifecycle trên build ký thực tế trước release.
- Xác minh tài liệu framework chính thức hiện hành khi chọn phiên bản, minimum OS hoặc deployment architecture; ghi ngày và nguồn. Không tự cài/nâng dependencies trong task audit.

## Bảo toàn nghiệp vụ và dữ liệu

- Giữ đủ năm địa điểm: Duluth, Johns Creek, Norcross, Kho DL House, Kho Extra; giữ phạm vi manager/staff ở backend.
- Không thay workflow, công thức, cách quy đổi, quyền, lifetime phiên, ownership nháp hay cách xử lý conflict mà không được phê duyệt.
- Giữ `known=false` khác số 0; ô đếm trống khác nhập `0`; dùng đơn vị theo từng item và precision hiện có.
- Giữ `revision`, transaction, ledger, `Idempotency-Key`, validation phía server và audit người thao tác. Không chuyển authority ghi tồn sang client.
- Mỗi category count hiện là một transaction; thao tác gửi nhiều category có thể thành công một phần. Không tự đổi thành all-or-nothing hoặc auto-merge.
- Không tự thêm last-write-wins, tự cộng hai số đếm, outbox tự gửi, approval workflow hoặc realtime sync. Các thay đổi này cần thiết kế/phê duyệt nghiệp vụ riêng.
- Business timezone là `America/New_York`; timezone trao đổi với người dùng là `Asia/Bangkok`. Báo cáo dùng count-sheet boundaries hiện tại, không tự chuyển sang calendar-week snapshots.
- Duy trì API cho client cũ trong thời gian migration; giữ request payload/key khi retry chưa rõ kết quả. Không coi idempotency là chống trùng với mọi key mới.
- Không reset/import đè/xóa database, sửa ledger cũ hoặc thay schema phá tương thích nếu chưa có phê duyệt rõ ràng.
- Trước thay đổi dữ liệu thật, cần backup SQLite nhất quán gồm dữ liệu WAL qua phương pháp được kiểm chứng và restore thử trên bản sao. Git checkpoint không thay cho database backup.
- Token native phải ở secure storage; không lưu mật khẩu để duy trì login. Khi đổi Capacitor sang RN, phải kiểm chứng khả năng chuyển cả token, pending logout và draft; không giả định Expo SecureStore đọc được kho cũ.
- Không in hoặc đưa credentials/token, file login hay authentication logs vào chat, tài liệu, commit hoặc PR. Chỉ ghi tên biến môi trường; không in giá trị bí mật dù hướng dẫn công cụ có ví dụ làm vậy.

## Git và an toàn thay đổi

- Giữ quy tắc hiện hữu trong `.github/copilot-instructions.md`: branch mới từ `main`, tên `Minh/<short-description>`; không dùng prefix `Codex`/`Copilot`.
- Commit/push feature branch và tích hợp qua pull request; không đẩy feature chưa merge trực tiếp lên `main`. Giữ các approval gate kiến trúc/production nêu trên.
- Đề xuất branch/worktree cô lập cho migration; không tự di chuyển hoặc bỏ các thay đổi của người dùng. Chỉ stage/commit đúng đường dẫn task; không dùng `git add .` khi có thay đổi không liên quan.
- `.agents/` và `skills-lock.json` có thể chứa customization đã stage từ trước; không commit kèm ứng dụng nếu chưa được yêu cầu.
- Tránh thay đổi không liên quan, framework rewrite đồng loạt, dependency churn hoặc sửa file generated bằng tay. Hỏi trước các thao tác phá hủy hay thay đổi kiến trúc lớn.
- Rollback UI/code phải giữ các giao dịch phát sinh sau rollout. Không restore database cũ chỉ để rollback giao diện.

## Kiểm thử và tài liệu

- Chạy kiểm thử phù hợp trước khi tuyên bố hoàn thành; báo đầy đủ lỗi và phần chưa chạy. Suite API: `npm.cmd test` (Windows) hoặc `node --test`.
- Suite browser: `node scripts/smoke-web.mjs`, `node scripts/verify-ui.mjs`. Dùng `:memory:` hoặc fixture dùng một lần, không dùng database vận hành; ảnh QA nằm ở thư mục tạm.
- Regression phải bao phủ counts, unit conversion, stale revision, concurrent writes, idempotency, authorization, partial receipts/transfers, counted receipts, history/Atlanta/DST, báo cáo và lỗi mạng.
- Unit tests mới cho logic dùng chung cần fixtures parity với implementation cũ; thêm integration tests cho DB/API và native tests cho secure storage, force-stop/reboot/update/logout.
- Phân biệt kiểm thử mới với lịch sử, in-memory với persistence sau restart, browser mock với native thật và simulator với physical device.
- Cập nhật `PROJECT_CONTEXT.md` và trạng thái tác vụ trong `docs/MIGRATION_PLAN.md` sau mỗi thay đổi triển khai có ý nghĩa hoặc mốc hoàn tất. Thay đổi format/cosmetic nhỏ có thể bỏ qua.
- Không ghi “hoàn tất migration” khi mới có source hoặc mockup; cần kiểm tra đủ checklist parity trên nền tảng tương ứng và ghi nhận mọi sai khác.
