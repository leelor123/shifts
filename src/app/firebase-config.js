/* Firebase web config — public by design; access to data is enforced by firestore.rules
 * (each signed-in user can read and write only users/{their uid}).
 * authDomain stays on firebaseapp.com: it is the only redirect address the Google sign-in client
 * accepts (checked with `node tools/fbapi.js redirectcheck`). */
// signing in with an email link (no password): on once "Email link" is turned on in Firebase Authentication
// (node tools/fbapi.js emaillink shiftpay-70ab6); until then the button stays out of sight
window.AUTH_EMAIL_LINK = false;
window.FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCOJVJ4voa19xGur66xEYOgHwooKl85vzI',
  authDomain: 'shiftpay-70ab6.firebaseapp.com',
  projectId: 'shiftpay-70ab6',
  storageBucket: 'shiftpay-70ab6.firebasestorage.app',
  messagingSenderId: '147711002217',
  appId: '1:147711002217:web:a2294c2b001ced1a9f84f8',
};
