import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  updateProfile, setPersistence, browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, collection, addDoc, getDocs, getDoc, doc, updateDoc, deleteDoc, setDoc,
  serverTimestamp, query, where, orderBy, limit, onSnapshot,
  writeBatch
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyD9bb385ymlSRzSU8HNTvDSmGHptOZs9Ck",
  authDomain: "seekunique-timer-110dd.firebaseapp.com",
  projectId: "seekunique-timer-110dd",
  storageBucket: "seekunique-timer-110dd.appspot.com",
  messagingSenderId: "885485349881",
  appId: "1:885485349881:web:7aae57715eacd18ce16b28",
  measurementId: "G-L5RQFD33EK"
};

const app  = initializeApp(firebaseConfig);

const auth = getAuth(app);
auth.useDeviceLanguage();

// ✅ persist login across restarts
setPersistence(auth, browserLocalPersistence).catch(console.error);

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

const db = getFirestore(app);

export {
  app, auth, db,
  // auth
  onAuthStateChanged, updateProfile,
  GoogleAuthProvider, provider, signInWithPopup, signInWithRedirect, getRedirectResult,
  // firestore
  collection, addDoc, getDocs, getDoc, doc, updateDoc, deleteDoc, setDoc,
  serverTimestamp, query, where, orderBy, limit, onSnapshot
  , writeBatch
};
