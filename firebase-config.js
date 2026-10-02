// ✅ তোমার Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyBrvetPlCaYE_9cd1dU0he7dN0ugjsEdPg",
  authDomain: "barishal-biriyani.firebaseapp.com",
  projectId: "barishal-biriyani",
  storageBucket: "barishal-biriyani.firebasestorage.app",
  messagingSenderId: "487454043608",
  appId: "1:487454043608:web:f0ae6225668ff2bb98d6ad",
  measurementId: "G-TF92W50L30"
};

// Initialize Firebase (Compat SDK - কারণ বাকি কোড compat ব্যবহার করছে)
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

console.log("✅ Firebase connected to: barishal-biriyani");