//駒の初期配置
const boardState = [
	["", "", "", "", "", ""],
	["歩", "歩", "歩", "歩", "歩", "歩"],
	["", "", "", "", "", ""],
	["", "", "", "", "", ""],
	["歩", "歩", "歩", "歩", "歩", "歩"],
	["", "", "", "", "", ""]
];

let selected = null;

//持ち駒リスト
let senteHand = ["香", "桂", "銀", "金", "王", "角", "飛"];
let goteHand = ["香", "桂", "銀", "金", "王", "角", "飛"];

//ゲームモード
let mode = "placement"; //(placement) or (battle)
let turn = "sente"; //sente->gote->sente...
let selectedHandPiece = null;

//盤面を生成する
const board = document.getElementById("board"); //HTMLの"board"を取ってくる

//6×6の盤面の生成
for (let rank = 1; rank <= 6; rank++) {
	for (let file = 1; file <= 6; file++) {
		
		//マスを作る
		const square = document.createElement("div"); //新たなdivを作成
		square.className = "square"; //CSSのsquareスタイルを適応

		//盤面の座標
		const pos = `${rank}${String.fromCharCode(96 + file)}`;
		square.dataset.pos = pos; //squareに座標情報を持たせる

		//マスに座標を表示（デバック用）
		square.textContent = ""; //マスの中身を空にする

		//マスをクリックしたら座標を表示する
		square.addEventListener("click", () => {
			const {rank, file} = getSquareIndex(pos);
			//駒置きフェーズ
			if (mode === "placement") {
				//持ち駒から選んだ駒がある
				if (selectedHandPiece && boardState[rank][file] === "") {
					boardState[rank][file] = selectedHandPiece;
					//持ち駒から削除
					if (turn === "sente") {
						senteHand = senteHand.filter(p => p !== selectedHandPiece);
						turn = "gote";
					} else {
						goteHand = goteHand.filter(p => p !== selectedHandPiece);
						turn = "sente";
					}

					selectedHandPiece = null;
					renderPieces();
					renderHands();

					//全部置いたら対局モードへ
					if (senteHand.length === 0 && goteHand.length === 0) {
						mode = "battle";
					}
				}
				return;
			}
			if (selected === null) {
				//1回目のクリック -> 駒を選択
				selected = {rank, file};
				square.classList.add("selected");
			} else {
				//2回目のクリック -> 移動処理へ
				movePiece(selected, {rank, file});
				clearSelection();
			}
			console.log("クリックされたマス:", pos);
		});

		//盤面に追加
		board.appendChild(square);
	}
}

function renderPieces() {
    const squares = document.querySelectorAll(".square");

    squares.forEach((sq, index) => {
        const rank = Math.floor(index / 6);
        const file = index % 6;

        const piece = boardState[rank][file];

        if (piece === "") {
            sq.textContent = "";
            sq.classList.remove("gote-piece");
        } else {
            // s_銀 → 銀 / g_銀 → 銀 に変換
            const pure = piece.replace(/^s_|^g_/, "");
            sq.textContent = pure;

            // 後手なら反転
            if (piece.startsWith("g_")) {
                sq.classList.add("gote-piece");
            } else {
                sq.classList.remove("gote-piece");
            }
        }
    });
}

function getSquareIndex(pos) {
	const rank = parseInt(pos[0]) - 1; //1~6 -> 0~5
	const file = pos.charCodeAt(1) - 97; //'a'~'f' -> 0~5
	return {rank, file};
}

function movePiece(from, to) {
	const piece = boardState[from.rank][from.file];

	//移動
	boardState[to.rank][to.file] = piece;

	//元の場所を空にする
	boardState[from.rank][from.file] = "";

	// 盤面を再描画
	renderPieces();

	//SFENを生成
	const sfen = makeSFEN(boardState, "b");
	console.log("現在のSFEN:", sfen);
}

function clearSelection() {
	const squares = document.querySelectorAll(".square");
	squares.forEach(sq => sq.classList.remove("selected"));
	selected = null;
}

//1段(rank)をSFENに変換する関数
function rankToSFEN(rankArray) {
	let sfen = "";
	let empty = 0;

	for (let cell of rankArray) {
		if (cell === "") {
			empty++;
		} else {
			if (empty > 0) {
				sfen += empty;
				empty = 0;
			}
			sfen += cell; //駒の文字（後で英語に変換する）
		}
	}

	if (empty > 0) sfen += empty;

	return sfen;
}

//6段すべてSFENに変換する関数
function boardToSFEN(boardState) {
	const ranks = boardState.map(rank => rankToSFEN(rank));
	return ranks.join("/");
}

function makeSFEN(boardState, turn = "b") {
	return boardToSFEN(boardState) + " " + turn;
}

function selectHandPiece(piece, owner) {
	selectedHandPiece = piece;
	selectedHandOwner = owner;
}

function renderHands() {
	const senteArea = document.getElementById("sente-pieces");
	const goteArea = document.getElementById("gote-pieces");

	senteArea.innerHTML = "";
	goteArea.innerHTML = "";

	senteHand.forEach(piece => {
		const div = document.createElement("div");
		div.className = "piece-hand";
		div.textContent = piece;
		div.addEventListener("click", () => selectHandPiece(piece, "sente"));
		senteArea.appendChild(div);
	});

	goteHand.forEach(piece => {
		const div = document.createElement("div");
		div.className = "piece-hand";
		div.textContent = piece;
		div.addEventListener("click", () => selectHandPiece(piece, "gote"));
		goteArea.appendChild(div);
	});
}



renderPieces();
renderHands();

const sfen = makeSFEN(boardState, "b");
console.log(sfen);
