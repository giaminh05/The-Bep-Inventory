const probe = 'https://127.0.0.1:4173/__verify';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const login = () => document.querySelector('#login-form');
const signedIn = () => document.querySelector('h1')?.textContent === 'Phiếu kiểm kê';
async function wait(check) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (check()) return;
    await delay(250);
  }
  throw new Error('App state did not change');
}
async function run() {
  const phase = await (await fetch(probe)).text();
  try {
    if (!window.Capacitor?.isNativePlatform?.() || window.Capacitor.isLoggingEnabled) {
      throw new Error('Native bridge configuration invalid');
    }
    if (phase === 'login') {
      await wait(login);
      const form = login();
      form.elements.username.value = 'norcross';
      form.elements.password.value = 'BepDemo2026!';
      form.requestSubmit();
    }
    if (phase === 'after-logout') await wait(login);
    else {
      await wait(signedIn);
      if (sessionStorage.getItem('bep-session')) throw new Error('Unexpected WebView session storage');
      if (phase === 'logout') {
        document.querySelector('[data-action=logout]').click();
        await wait(login);
      }
    }
    await fetch(probe + '?result=pass', { method: 'POST' });
  } catch (error) {
    const status = document.querySelector('.loading p')?.textContent;
    await fetch(probe + '?result=' + encodeURIComponent(status || error.message), { method: 'POST' });
  }
}
void run();
