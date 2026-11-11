set -euxo pipefail
mkdir -p "$BEP_IOS_TMP"
if test "$1" = build; then
npm run build:mobile -- https://127.0.0.1:4173
cp scripts/verify-ios-probe.js dist/verify-ios-probe.js
sed -i '' '/<\/head>/i\
  <script type="module" src="./verify-ios-probe.js"></script>
' dist/index.html
npx cap sync ios
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath "$BEP_IOS_TMP/build" -quiet build

  exit 0
fi
bep_sim="$(xcrun simctl list devices available -j | jq -r '[.devices|to_entries[]|select(.key|endswith("iOS-26-2"))|.value[]|select(.isAvailable and (.name|startswith("iPhone")))|.udid][0] // empty')"
test -n "$bep_sim"
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 1 \
  -subj '/CN=127.0.0.1' -addext 'subjectAltName=IP:127.0.0.1' \
  -keyout "$BEP_IOS_TMP/key.pem" -out "$BEP_IOS_TMP/cert.pem" 2>/dev/null
node scripts/verify-ios-server.mjs &
bep_server="$!"
trap 'kill "$bep_server" 2>/dev/null || true' EXIT
xcrun simctl boot "$bep_sim"

gtimeout 90 xcrun simctl bootstatus "$bep_sim" -b
xcrun simctl keychain "$bep_sim" add-root-cert "$BEP_IOS_TMP/cert.pem"
bep_app="$BEP_IOS_TMP/build/Build/Products/Release-iphonesimulator/App.app"
bep_id=com.thebepteahouse.inventory
xcrun simctl install "$bep_sim" "$bep_app"
bep_phase() {
  printf '%s' "$1" > "$BEP_IOS_TMP/phase"
  xcrun simctl launch "$bep_sim" "$bep_id"
  for attempt in $(seq 1 45); do
    if test -f "$BEP_IOS_TMP/$1"; then
      test "$(cat "$BEP_IOS_TMP/$1")" = pass || { cat "$BEP_IOS_TMP/$1"; return 1; }
      printf 'PASS iOS %s\n' "$1"
      return
    fi
    sleep 1
  done
  printf 'No result from iOS phase %s\n' "$1"
  return 1
}
bep_phase login
xcrun simctl terminate "$bep_sim" "$bep_id"
bep_phase reopen
xcrun simctl terminate "$bep_sim" "$bep_id"
xcrun simctl shutdown "$bep_sim"
gtimeout 90 xcrun simctl bootstatus "$bep_sim" -b
bep_phase reboot
xcrun simctl terminate "$bep_sim" "$bep_id"
xcrun simctl install "$bep_sim" "$bep_app"
bep_phase reinstall
xcrun simctl terminate "$bep_sim" "$bep_id"
bep_phase logout
xcrun simctl terminate "$bep_sim" "$bep_id"
bep_phase after-logout

