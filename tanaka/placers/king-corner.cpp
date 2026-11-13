// =========================
// 配置AI：玉を端に置く
//   合法手（置ける駒とマスの組み合わせ）を全部出して、点数の一番高い手を選ぶ
//   玉を自分から見て右端（先手は1筋、後手は6筋）に置く手が一番高く、次が左端。ほかはランダム
//
// やりとり（1行ずつ）
//   受け取る: placement <後手の段> <先手の段> <b|w>
//            例: placement 2g3 2K3 b   （段は SFEN と同じ書き方、b = 先手が置く番、w = 後手が置く番）
//   返す   : bestplace <駒>*<マス>
//            例: bestplace S*3f   （3六に銀。先手は f = 六段目、後手は a = 一段目）
//   受け取る: quit → 終了
//
// 作り方（fairy-stockfish の指し手と同じ流れ）
//   ① 合法手の一覧を作る（legalPlaces）
//   ② それぞれに点数をつける（score）    ← 新しい配置AIを作るときは、ここを書き換える
//   ③ 一番点数の高い手を返す
// =========================
#include <iostream>
#include <sstream>
#include <string>
#include <vector>
#include <random>
#include <cctype>

using namespace std;

mt19937 rng(random_device{}());   // 乱数を作る機械

// 配置の1手（どの駒を、左から何番目のマスに置くか）
struct Place {
    char piece;   // 'K', 'G', 'S', 'N', 'L', 'R', 'B'
    int  col;     // 左から 0〜5（0 が 6筋、5 が 1筋）
};

// 段を6文字に広げる（大文字にそろえる、空きは '.'）  例: "2g3" → "..G..."
string expandRow(const string& sfenRow) {
    string row;
    for (char c : sfenRow) {
        if (c >= '1' && c <= '6') row += string(c - '0', '.');
        else                      row += char(toupper(c));
    }
    return row;
}

// ① 合法手の一覧を作る：まだ置いていない駒 × 空いているマス
//    飛と角はどちらか片方だけ使う（片方を置いていたら、どちらも候補に入れない）
vector<Place> legalPlaces(const string& row) {
    string remaining;
    for (char p : string("KGSNL")) {
        if (row.find(p) == string::npos) remaining += p;
    }
    if (row.find('R') == string::npos && row.find('B') == string::npos) remaining += "RB";

    vector<Place> places;
    for (char piece : remaining) {
        for (int col = 0; col < (int)row.size(); col++) {
            if (row[col] == '.') places.push_back({ piece, col });
        }
    }
    return places;
}

// ② 手に点数をつける（点数が高い手ほど選ばれる）
//    玉を端に置く手を高くする。それ以外はランダム（0〜999点）
int score(const Place& place, const string& row, bool isSente) {
    int right = isSente ? 5 : 0;   // 自分から見て右端（左から何番目か）
    int left  = isSente ? 0 : 5;   // 自分から見て左端

    if (place.piece == 'K' && place.col == right) return 2000;   // 玉を右端に置く手が一番
    if (place.piece == 'K' && place.col == left)  return 1500;   // 右端が埋まっていたら左端
    return rng() % 1000;
}

int main() {

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

        vector<Place> places = legalPlaces(row);
        if (row.size() != 6 || places.empty()) {
            cout << "bestplace none" << endl;
            continue;
        }

        // ③ 一番点数の高い手を選ぶ
        Place best = places[0];
        int bestScore = score(best, row, isSente);
        for (const Place& place : places) {
            int s = score(place, row, isSente);
            if (s > bestScore) {
                bestScore = s;
                best = place;
            }
        }

        // 左から col 番目 → 筋（左端が 6筋）。段は先手なら f、後手なら a
        int  file = 6 - best.col;
        char rank = isSente ? 'f' : 'a';

        cout << "bestplace " << best.piece << "*" << file << rank << endl;   // endl で必ずすぐに送る
    }
    return 0;
}
