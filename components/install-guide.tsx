"use client";

import { useEffect, useState } from "react";
import { isIOS } from "@/client/pwa/install";

/** ホーム画面への追加の手順（手順の画像は仮。後で実際の画面の画像に差し替える） */
export function InstallSteps() {
  const [ios, setIos] = useState(false);
  useEffect(() => setIos(isIOS()), []);

  return ios ? (
    <ol className="list-decimal space-y-2 pl-6">
      <li>
        画面の下（iPad は上）にある <strong>共有ボタン</strong>
        <span aria-hidden="true">（□に↑のマーク）</span>をタップします。
      </li>
      <li>
        <strong>「ホーム画面に追加」</strong>を選びます。
      </li>
      <li>右上の「追加」をタップします。</li>
      <li>ホーム画面にできた「かえりうち」のアイコンから開いてください。</li>
    </ol>
  ) : (
    <ol className="list-decimal space-y-2 pl-6">
      <li>
        ブラウザのメニュー<span aria-hidden="true">（︙）</span>を開きます。
      </li>
      <li>
        <strong>「ホーム画面に追加」</strong>または
        <strong>「アプリをインストール」</strong>を選びます。
      </li>
      <li>ホーム画面にできた「かえりうち」のアイコンから開いてください。</li>
    </ol>
  );
}
