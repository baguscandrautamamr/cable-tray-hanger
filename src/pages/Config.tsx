import { ArrowLeft } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import HangerConfigForm from "../components/HangerConfigForm";

interface ConfigProps {
  session: Session | null;
  projectName: string;
}

export default function Config({ session, projectName }: ConfigProps) {
  const navigate = useNavigate();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <header className="flex items-center gap-3">
        <Link to="/" className="text-slate-500 hover:text-slate-300">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">New Hanger Config</h1>
          <p className="text-sm text-slate-500">{projectName}</p>
        </div>
      </header>

      <HangerConfigForm
        session={session}
        projectName={projectName}
        onSaved={() => navigate("/")}
      />
    </div>
  );
}
