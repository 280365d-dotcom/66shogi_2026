// =========================
// 配置AI：ランダム
//   残っている駒と空いているマスを、ランダムに選んで置く
//
// やりとり（1行ずつ）
//   受け取る: placement <後手の段> <先手の段> <b|w>
//            例: placement l1g3 2K3 b   （段は SFEN と同じ書き方、b = 先手が置く番、w = 後手が置く番）
//   返す   : bestplace <駒>*<マス>
//            例: bestplace S*4f   （4六に銀。先手は f = 六段目、後手は a = 一段目）
//   受け取る: quit → 終了
// =========================
#include <iostream>
#include <sstream>
#include <string>
#include <vector>
#include <random>
#include <cctype>

using namespace std;

// 段を6文字に広げる（大文字にそろえる、空きは '.'）  例: "l1g3" → "L.G..."
string expandRow(const string& sfenRow) {
    string row;
    for (char c : sfenRow) {
        if (c >= '1' && c <= '6') row += string(c - '0', '.');
        else                      row += char(toupper(c));
    }
    return row;
}

// まだ置いていない駒（飛と角はどちらか片方だけ使う）
string remainingPieces(const string& row) {
    string remaining;
    for (char p : string("KGSNL")) {
        if (row.find(p) == string::npos) remaining += p;
    }
    if (row.find('R') == string::npos && row.find('B') == string::npos) remaining += "RB";
    return remaining;
}

int main() {

    mt19937 rng(random_device{}());   // 乱数を作る機械

    string line;
    while (getline(cin, line)) {

        istringstream is(line);
        string command;
        is >> command;

        if (command == "quit") break;
        if (command != "placement") continue;

        string goteRow, senteRow, side;
        is >> goteRow >> senteRow >> side;

        bool isSente = (side == "b");
        string row = expandRow(isSente ? senteRow : goteRow);   // 自分の段

        string remaining = remainingPieces(row);
        vector<int> empties;                                     // 空いているマス（左から 0〜5）
        for (int col = 0; col < (int)row.size(); col++) {
            if (row[col] == '.') empties.push_back(col);
        }

        if (row.size() != 6 || remaining.empty() || empties.empty()) {
            cout << "bestplace none" << endl;
            continue;
        }

        // ---- ここで置く駒とマスを決める ----
        char piece = remaining[rng() % remaining.size()];
        int  col   = empties[rng() % empties.size()];

        // 左から col 番目 → 筋（左端が 6筋）。段は先手なら f、後手なら a
        int  file = 6 - col;
        char rank = isSente ? 'f' : 'a';

        cout << "bestplace " << piece << "*" << file << rank << endl;   // endl で必ずすぐに送る
    }
    return 0;
}
