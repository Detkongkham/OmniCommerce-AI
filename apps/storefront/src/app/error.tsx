"use client";

import { Button, EmptyState } from "@oca/ui";
import { CloudOff } from "lucide-react";
import { useEffect } from "react";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert">
      <EmptyState
        icon={CloudOff}
        title="ໂຫຼດຂໍ້ມູນບໍ່ສຳເລັດ"
        description="ກະລຸນາລອງໃໝ່ອີກຄັ້ງ ຖ້າຍັງບໍ່ໄດ້ ໃຫ້ລອງໃໝ່ພາຍຫຼັງ"
        action={
          <Button variant="outlinePrimary" onClick={() => retry()}>
            ລອງໃໝ່
          </Button>
        }
      />
    </div>
  );
}
