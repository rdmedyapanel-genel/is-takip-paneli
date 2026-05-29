const firebaseConfig = {
        apiKey: "AIzaSyCrPd3BNDJiEK2wXOOmm1CTh9GofipnYNI",
        authDomain: "is-takip-paneli-8523a.firebaseapp.com",
        projectId: "is-takip-paneli-8523a",
        storageBucket: "is-takip-paneli-8523a.firebasestorage.app",
        messagingSenderId: "391985906793",
        appId: "1:391985906793:web:a546e24623c8a6c2e10ef8"
    };

    if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
    const db = firebase.firestore();
