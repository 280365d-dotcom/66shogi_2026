import platform # 今使っているPCがMacかWindowsか調べる
import re # 文字列のパターンを調べる
import subprocess # エンジンを別のプログラムとして起動する
import threading
from flask_sock import Sock
from pathlib import Path # ファイルの場所を、OSの違いを気にせず扱う

from flask import Flask, jsonify, request

# 場所の指定のために使用
BASE = Path(__file__).resolve().parent
#variants.ini(66将棋のルール)を読み込ませる
VARIANT_FILE = BASE / "variants.ini"
VARIANT_NAME = "shogi66"
 
# NAME_TO_LETTER["歩"] -> "P"
NAME_TO_LETTER = {
  "歩": "P", "香": "L", "桂": "N", "銀": "S",
  "金": "G", "角": "B", "飛": "R", "王": "K",
}

# "P" -> 歩
LETTER_TO_NAME = {v: k for k, v in NAME_TO_LETTER.items()}

# サーバーの本体を作る
app = Flask(__name__) 
sock = Sock(app)
# 起動したエンジンを入れておく変数
engine = None 

# s_歩 -> P / g_歩 -> p / s_+銀 -> +S ...
def cell_to_fen(cell):
  owner = cell[0] # 's'か'g'
  body = cell[2:] # 's_'の後ろ
  promoted = body.startswith("+")
  name = body[1:] if promoted else body # 成り駒なら「+」を除く
  if name not in NAME_TO_LETTER:
    raise ValueError(f"未知の駒名です: {cell}")
  letter = NAME_TO_LETTER[name]
  if owner == "g":
    letter = letter.lower()
  return ("+" if promoted else "") + letter # 成り駒なら「+」をつけて返す

#['歩', '銀'] -> 'PS'(後手なら小文字)
def hand_to_fen(hand, is_sente):
  text = ""
  for name in hand:
    letter = NAME_TO_LETTER[name]
    text += letter if is_sente else letter.lower()
  return text

# GUIの局面 -> エンジン用のFEN文字列(["","","","","","s_王"] -> 5K)
def state_to_fen(state):
  rows = [] # 6段分の文字列を入れておく配列
  for row in state["board"]:
    text = "" # 今見ている段の文字れrつ
    empty = 0 # 直前まで空きマスが何マス続いたか
    for cell in row:
      if cell == "":
        empty += 1
      else:
        if empty > 0:
          text += str(empty)
          empty = 0
        text += cell_to_fen(cell)
    if empty > 0:
      text += str(empty)
    rows.append(text)

  hands = hand_to_fen(state["senteHand"], True) + hand_to_fen(state["goteHand"], False)
  turn = "w" if state["turn"] == "sente" else "b"
  return "/".join(rows) + f"[{hands or '-'}] {turn} 0 1"

# エンジンのマス表記 'c5' -> GUI座標 {rank, file}
def from_engine_square(sq):
  file = ord(sq[0]) - ord("a")
  rank = 6 - int(sq[1])
  return {"rank": rank, "file": file}

# c2c3 -> c2のマスからc3のマスへ
def parse_move(token):
  # 文字列がパターンの形になっている時、m = True
  m = re.match(r"^([A-Za-z])@([a-f][1-6])$", token)
  if m:
    # 駒の配置時
    return {
      "from": None, # 移動元はない
      "to": from_engine_square(m.group(2)), # 打つ場所
      "promote": False, # 駒打ちでは成らない
      "drop": LETTER_TO_NAME[m.group(1).upper()], # 'P' -> '歩'
    }
  m = re.match(r"^([a-f][1-6])([a-f][1-6])(\+?)$", token)
  if m:
    # 通常の移動時
    return {
      "from": from_engine_square(m.group(1)), # 移動元
      "to": from_engine_square(m.group(2)), # 移動先
      "promote": m.group(3) == "+", # グループ3が'+'ならTrue
      "drop": None, #駒打ちではない
    }
  return None

# エンジンに局面を伝え、最善手がでるまで待つ関数
def get_bestmove(proc, fen, movetime):
  send(proc, f"position fen {fen}")
  send(proc, f"go movetime {movetime}")
  while True:
    raw = proc.stdout.readline()
    if raw == "":
      raise RuntimeError("エンジンを修了しました")
    line = raw.strip()
    if line.startswith("bestmove"):
      return line.split()[1]

# OSに合わせて使うエンジンのファイルを選ぶ
def engine_path():
  system = platform.system()
  if system == "Windows":
    name = "fairy-stockfish-win.exe"
  elif system == "Darwin": # Mac
    name = "fairy-stockfish-mac"
  else:
    name = "fairy-stock-linux"
  path = BASE / "engines" / name
  if not path.exists():
    raise FileNotFoundError(f"エンジンが見つかりません: {path}")
  return path

# エンジンに命令を1つ送る
def send(proc,cmd):
  proc.stdin.write(cmd + "\n")
  proc.stdin.flush()

# end_lineという行が来るまで読み、読んだ行を返す
def read_until(proc, end_line):
  lines = []
  while True:
    line = proc.stdout.readline().strip()
    lines.append(line)
    if line == end_line:
      return lines

# エンジンを起動して66将棋のルールを読み込ませる
def start_engine():
  # エンジンを起動する
  proc = subprocess.Popen(
    [str(engine_path())],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    text=True,
    encoding="utf-8",
    bufsize=1,
  )

  # uciと話しかけてuciokまで読む
  send(proc, "uci")
  for line in read_until(proc, "uciok"):
    if line.startswith("id name"):
      print("エンジン:", line)

  # 66将棋のルールを読み込む(絶対パスで渡す)
  send(proc, f"setoption name VariantPath value {VARIANT_FILE}")
  send(proc, f"setoption name UCI_Variant value {VARIANT_NAME}")

  # 本当に6x6になったか確かめる
  send(proc, "position startpos")
  send(proc, "d")
  send(proc, "isready")
  lines = read_until(proc, "readyok")
  if not any("ranks 6" in line for line in lines):
    raise RuntimeError("66将棋のルールを読み込めませんでした。variants.iniを確認してください")
  print("66将棋のルールを読み込みました")
  return proc


# /healthにアクセスが来たら下の関数を実行する
@app.route("/health")
def health():
  alive = engine is not None and engine.poll() is None
  #Pythonの辞書を、JSON形式にして返す
  return jsonify({"ok": True, "engine": "ready" if alive else "down"})

@app.route("/legal-moves", methods=["POST"])
def legal_moves():
  data = request.get_json()
  fen = state_to_fen(data["state"])
  moves = get_legal_moves(engine, fen)

  #fromが指定されたら、そのマスから動く手だけに絞る
  frm = data.get("from")
  if frm is not None:
    moves = [m for m in moves if m["from"] == frm]

  #dropが指定されたら、その駒を打つ手だけに絞る
  drop = data.get("drop")
  if drop is not None:
    moves = [m for m in moves if m["drop"] == drop]

  return jsonify({"ok": True, "moves": moves})

@app.route("/bestmove", methods=["POST"])
def bestmove():
  data = request.get_json() # GUIが送ったJSONをPythonの辞書として受け取る
  fen = state_to_fen(data["state"])
  movetime = data.get("movetime", 1000)

  token = get_bestmove(engine, fen, movetime)
  if token == "(none)":
    return jsonify({"ok": True, "move": None})
  return jsonify({"ok": True, "move": parse_move(token), "raw": token})

# 局面の合法手を、全て返す(go perft1の出力を読む)
def get_legal_moves(proc, fen):
  send(proc, f"position fen {fen}")
  send(proc, "go perft 1")
  moves = [] # 見つけた手をためていく配列
  while True:
    raw = proc.stdout.readline()
    if raw == "":
      raise RuntimeError("エンジンが終了しました")
    line = raw.strip()
    m = re.match(r"^(\S+): \d+$", line)
    if m:
      move = parse_move(m.group(1))
      if move is not None:
        moves.append(move)
    if line.startswith("Nodes searched"):
      return moves

# ブラウザから受け付けるエンジンのコマンド(これ以外は拒否する)
ALLOWED_COMMANDS = {"position", "go", "stop", "d", "isready", "usinewgame"}


def start_usi_engine():
    """USIモードでエンジンを起動し、66将棋のルールを読み込ませる"""
    proc = subprocess.Popen(
        [str(engine_path())],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        bufsize=1,
    )
    send(proc, "usi")
    read_until(proc, "usiok")  # 起動時のオプション一覧は読み捨てる
    send(proc, f"setoption name VariantPath value {VARIANT_FILE}")
    send(proc, f"setoption name UCI_Variant value {VARIANT_NAME}")
    send(proc, "isready")
    lines = read_until(proc, "readyok")
    if not any("ranks 6" in line for line in lines):
        proc.kill()
        raise RuntimeError("66将棋のルールを読み込めませんでした")
    return proc


@sock.route("/ws")
def ws_engine(ws):
    """ブラウザ(WebSocket)とエンジンの間で、コマンドを中継する"""
    proc = start_usi_engine()  # 接続ごとに、専用のエンジンを1つ起動する

    def pump():
        """エンジンの出力を、1行ずつブラウザへ送る"""
        for raw in proc.stdout:
            try:
                ws.send(raw.rstrip("\r\n"))
            except Exception:
                break

    threading.Thread(target=pump, daemon=True).start()

    try:
        while True:
            message = ws.receive()
            if message is None:
                break
            for command in message.splitlines():  # 複数行を一度に送られても1行ずつ検査する
                command = command.strip()
                if command.split(" ")[0] in ALLOWED_COMMANDS:
                    send(proc, command)
                else:
                    ws.send(f"info string 受け付けないコマンド: {command}")
    except Exception:
        pass  # ブラウザが閉じられたときなど
    finally:
        proc.kill()  # 接続が終わったら、エンジンも終了する

print("__name__ の中身:", __name__)
# 直接実行した時に実行する(importを除く)
if __name__ == "__main__":
  engine = start_engine()
  print("エンジン起動OK")
  # サーバー起動
  app.run(host="127.0.0.1", port=5000)
