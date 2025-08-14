// ==UserScript==
// @name         GeoFS Flight Timer
// @namespace    http://tampermonkey.net/
// @version      1.8.0-mod
// @author       SeaBus (modded by ChatGPT)
// @description  Flight timer and pauses if the plane touch the ground, shows if u press "N"
// @match        https://www.geo-fs.com/geofs.php*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const svgNS = "http://www.w3.org/2000/svg";
    let elapsedMs = 0;
    let running = false;
    let lastTick = null;
    let visible = false; // 預設不顯示
    let tabPaused = false;

    // 從 localStorage 載入計時
    const savedTime = localStorage.getItem("geofsFlightTimerCurrent");
    if (savedTime) {
        elapsedMs = parseInt(savedTime, 10) || 0;
    }

    // 建立容器
    const container = document.createElement("div");
    container.style.position = "absolute";
    container.style.bottom = "200px";
    container.style.left = "20px";
    container.style.zIndex = "9999";
    container.style.background = "rgba(255,255,255,0.8)";
    container.style.borderRadius = "8px";
    container.style.padding = "8px";
    container.style.textAlign = "center";
    container.style.fontFamily = "monospace";
    container.style.boxShadow = "0 2px 8px rgba(0,0,0,0.4)";
    container.style.display = "none"; // 預設不顯示
    document.body.appendChild(container);

    // 建立SVG時鐘
    const clockSize = 120;
    const clock = document.createElementNS(svgNS, "svg");
    clock.setAttribute("width", clockSize);
    clock.setAttribute("height", clockSize);
    clock.setAttribute("viewBox", "0 0 100 100");

    const face = document.createElementNS(svgNS, "circle");
    face.setAttribute("cx", "50");
    face.setAttribute("cy", "50");
    face.setAttribute("r", "48");
    face.setAttribute("fill", "#fff");
    face.setAttribute("stroke", "#000");
    face.setAttribute("stroke-width", "2");
    clock.appendChild(face);

    for (let i = 0; i < 60; i++) {
        const tick = document.createElementNS(svgNS, "line");
        const angle = (i / 60) * 2 * Math.PI;
        const x1 = 50 + Math.sin(angle) * 45;
        const y1 = 50 - Math.cos(angle) * 45;
        const x2 = 50 + Math.sin(angle) * (i % 5 === 0 ? 40 : 43);
        const y2 = 50 - Math.cos(angle) * (i % 5 === 0 ? 40 : 43);
        tick.setAttribute("x1", x1);
        tick.setAttribute("y1", y1);
        tick.setAttribute("x2", x2);
        tick.setAttribute("y2", y2);
        tick.setAttribute("stroke", "#000");
        tick.setAttribute("stroke-width", i % 5 === 0 ? "2" : "1");
        clock.appendChild(tick);
    }

    function createHand(length, width, color) {
        const hand = document.createElementNS(svgNS, "line");
        hand.setAttribute("x1", "50");
        hand.setAttribute("y1", "50");
        hand.setAttribute("x2", "50");
        hand.setAttribute("y2", 50 - length);
        hand.setAttribute("stroke", color);
        hand.setAttribute("stroke-width", width);
        hand.setAttribute("stroke-linecap", "round");
        clock.appendChild(hand);
        return hand;
    }

    const hourHand = createHand(20, 3, "black");
    const minuteHand = createHand(30, 2, "blue");
    const hour24Hand = createHand(35, 1.5, "red");

    container.appendChild(clock);

    // 文字計時
    const timeText = document.createElement("div");
    timeText.textContent = "00:00:00";
    timeText.style.fontSize = "14px";
    timeText.style.marginTop = "4px";
    container.appendChild(timeText);

    // Restart 按鈕
    const restartBtn = document.createElement("button");
    restartBtn.textContent = "Restart";
    restartBtn.style.marginTop = "6px";
    restartBtn.style.padding = "2px 8px";
    restartBtn.style.fontSize = "12px";
    restartBtn.style.cursor = "pointer";
    restartBtn.onclick = () => {
        elapsedMs = 0;
        localStorage.removeItem("geofsFlightTimerCurrent");
        lastTick = performance.now();
        updateDisplay();
    };
    container.appendChild(restartBtn);

    // 更新畫面
    function updateDisplay() {
        const totalSeconds = Math.floor(elapsedMs / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        timeText.textContent =
            String(hours).padStart(2, "0") + ":" +
            String(minutes).padStart(2, "0") + ":" +
            String(seconds).padStart(2, "0");

        const hourAngle = (hours % 12 + minutes / 60) * 30;
        const minuteAngle = (minutes + seconds / 60) * 6;
        const hour24Angle = (hours % 24 + minutes / 60) * 15;

        hourHand.setAttribute("transform", `rotate(${hourAngle},50,50)`);
        minuteHand.setAttribute("transform", `rotate(${minuteAngle},50,50)`);
        hour24Hand.setAttribute("transform", `rotate(${hour24Angle},50,50)`);
    }

    // 每幀更新
    let lastSave = 0;
    function tick() {
        if (running) {
            const now = performance.now();
            if (lastTick) elapsedMs += now - lastTick;
            lastTick = now;

            if (now - lastSave > 1000) { // 每秒儲存一次
                localStorage.setItem("geofsFlightTimerCurrent", elapsedMs.toString());
                lastSave = now;
            }
        } else {
            lastTick = null;
        }
        updateDisplay();
        requestAnimationFrame(tick);
    }
    tick();

    // 偵測 GeoFS 暫停 + 地面狀態
    setInterval(() => {
        if (typeof geofs !== "undefined" && geofs.aircraft?.instance) {
            const isOnGround = geofs.aircraft.instance.groundContact || geofs.aircraft.instance.isOnGround;
            const isPaused = geofs.pause;
            running = !isOnGround && !isPaused && !tabPaused;
        }
    }, 500);

    // 分頁可見性變化 → 立刻暫停 / 恢復
    document.addEventListener("visibilitychange", () => {
        tabPaused = document.visibilityState !== 'visible';
        if (tabPaused) {
            running = false;
        } else {
            if (typeof geofs !== "undefined" && geofs.aircraft?.instance) {
                const isOnGround = geofs.aircraft.instance.groundContact || geofs.aircraft.instance.isOnGround;
                const isPaused = geofs.pause;
                running = !isOnGround && !isPaused;
            }
            lastTick = performance.now();
        }
    });

    // 鍵盤 N 切換顯示/隱藏
    document.addEventListener("keydown", (e) => {
        if (e.key.toLowerCase() === "n") {
            visible = !visible;
            container.style.display = visible ? "block" : "none";
        }
    });
})();
