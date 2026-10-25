#include <iostream>
#include <string>
#include <sstream>
#include <vector>
#include <random>

int main() {
  // 乱数を作る機械を用意
  std::mt19937 rng(std::random_device{}());
  // 読み込んだ1行を入れる箱
  std::string line;
  // 1行読み込む → 処理する、をずっと繰り返す
  while (std::getline(std::cin, line)) { 

    // line を、スペースで区切って1個ずつ読める形にする
    std::istringstream iss(line);

    // 最初の1個を「命令」として読む
    // 例: "moves 5e5d 4e4d" → cmd = "moves"
    std::string cmd;
    iss >> cmd;

    // "quit" が来たらプログラムを終わる
    if(cmd == "quit") {
      break;
    }

    // "moves" 以外の命令は無視して、次の行を待つ
    if(cmd != "moves") {
      continue;
    }

    // 候補手を入れる箱（配列）
    std::vector<std::string> moves;

    // 1個ずつ読んだ手を一時的に入れる箱
    std::string m;
    
    // 残りを1個ずつ読んで、movesに追加していく
    // もう読むものがなくなったら繰り返しが終わる
    // 例: moves = { "5e5d", "4e4d" }
    while (iss >> m) {
      moves.push_back(m);
    }

    // ---- ここから下は確認用（後で消す） ----

        // 候補手が1つもないときは投了（resign）を返す
        if (moves.empty()) {
            std::cout << "bestmove resign" << std::endl;
            continue;
        }

        // 0 から（候補手の数 - 1）までの中で、ランダムな番号を1つ作る
        // 例: 候補手が3つなら 0, 1, 2 のどれか
        std::uniform_int_distribution<int> dist(0, moves.size() - 1);
        int index = dist(rng);

        // 選んだ手を返す
        // 例: "bestmove 4e4d"
        std::cout << "bestmove " << moves[index] << std::endl;
      }
  return 0;
}