"use client";

import { useEffect } from "react";
import { requestPersistentStorage } from "@/client/pwa/install";
import { useNav } from "@/client/pwa/navigate";
import { dismissInstallPrompt } from "@/client/store/repo";
import { Gate } from "@/components/gate";
import { InstallSteps } from "@/components/install-guide";
import { Button, Page } from "@/components/ui";

/** 初めて使うときの流れの最後：ホーム画面への追加の案内（NFR U1-PWA の iOS の注意点） */
export default function Install() {
  const router = useNav();

  useEffect(() => {
    void requestPersistentStorage();
  }, []);

  const later = async () => {
    await dismissInstallPrompt();
    router.replace("/profiles");
  };

  return (
    <Gate level="pin">
      {() => (
        <Page
          title="ホーム画面に追加してください"
          footer={
            <>
              <Button onClick={() => router.replace("/profiles")}>
                追加しました
              </Button>
              <Button variant="secondary" onClick={later}>
                あとで
              </Button>
            </>
          }
        >
          <p>
            ブラウザのまま使うと、しばらく開かなかったときに、まだクラウドに送っていない記録が消えることがあります（特に
            iPhone・iPad の
            Safari）。ホーム画面に追加すると、アプリのように使え、データも消えにくくなります。
          </p>
          <InstallSteps />
        </Page>
      )}
    </Gate>
  );
}
