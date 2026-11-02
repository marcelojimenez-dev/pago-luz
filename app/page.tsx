import { chatGPTSignOutPath, requireChatGPTUser } from "@/app/chatgpt-auth";
import { Dashboard } from "@/components/dashboard";
import { ensureBootstrap, getDashboardData } from "@/lib/server-data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireChatGPTUser("/");
  await ensureBootstrap(user);
  const data = await getDashboardData(user.userId);

  return (
    <Dashboard
      data={data}
      user={{ displayName: user.displayName, email: user.email }}
      signOutPath={chatGPTSignOutPath("/")}
    />
  );
}
