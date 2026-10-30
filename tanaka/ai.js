// =========================
// AI に指させる
// =========================

// AI が担当する側（"sente" / "gote"）
// null にすると自動では指さない（ボタンで指させる）
let aiSide = "null"; // 最初はオフ

// ボタンが押されたときに実行する関数
function askAI() {

  // ----1. 指して良いタイミングか確認 ----

  // 配置中は指せない
  if(mode !== "battle") {
    console.log("まだ配置中です");
    return;
  }

  // エンジンから合法手が全部届くまでは指せない
  if (!legalMovesReady) {
    console.log("合法手を取得中です。もう一度押してください");
    return;
  }

  // ----2. 候補手を絞り込む ----

  // 今の手番の人の持ち駒
  const hand = turn === "sente" ? senteHand : goteHand;

  // 合法手の中から、使える手だけを残す
  const candidates = legalMoves.filter(m => {

    // コマを動かす手("*"がない)はそのまま残す
    if (!m.includes("*")) return true;

    // 駒打ち（例: "B*3c"）は、その駒を本当に持っている時だけ残す
    // （使わなかった飛・角がエンジンの持ち駒に残っているため）
    const pieceJP = pieceMap[m[0].toLowerCase()]; // "B" → "角"
    return hand.includes(pieceJP);
  });

  // ---- 3. C++ の AI に候補手を送る ----
  if(candidates.length === 0) {
    console.log("指せる手がありません（詰み）");
    return;
  }

  // 返事が来るまで、もう一度押しても送らないようにする
  legalMovesReady = false;

  ws.send(lastPositionCommand);       // 今の局面を伝える
  ws.send("go movetime 1000");    // 考えて bestmove を返してもらう

  console.log("C++ AIに送信:", candidates.length, "手");
}

// =========================
// AI対戦のオン・オフ
// =========================
const aiAutoButton = document.getElementById("ai-auto");

aiAutoButton.addEventListener("click", () => {

  if (aiSide === null) {
    // オンにする：AIは後手を持つ
    aiSide = "gote";
    aiAutoButton.textContent = "AI対戦：オン";

    // すでにAIの手番なら、すぐに指させる
    if (mode === "battle" && !gameOver && turn === aiSide && legalMovesReady) {
      askAI();
    }
  } else {
    // オフにする
    aiSide = null;
    aiAutoButton.textContent = "AI対戦：オフ"
  }
})
// 「AIに指させる」ボタン（id="ai-move"）が押されたら askAI を実行する
document
    .getElementById("ai-move")
    .addEventListener("click", askAI);