import { ArrowLeft } from "lucide-react";
import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import HangerConfigForm from "../components/HangerConfigForm";

interface ConfigProps {
  session: Session | null;
  /** Shown until a scan arrives and names the project itself. */
  fallbackProjectName: string;
}

export default function Config({ session, fallbackProjectName }: ConfigProps) {
  const navigate = useNavigate();

  // The project is whatever the add-in scanned under, not a build-time
  // constant that has to be kept in step with the Settings dialog by hand.
  const [projectName, setProjectName] = useState<string | null>(null);

  const handleProjectName = useCallback((name: string) => setProjectName(name), []);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <header className="flex items-center gap-3">
        <Link to="/" className="text-slate-500 hover:text-slate-300">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">New Hanger Config</h1>
          <p className="text-sm text-slate-500">{projectName ?? fallbackProjectName}</p>
        </div>
      </header>

      <HangerConfigForm
        session={session}
        onProjectName={handleProjectName}
        onSaved={() => navigate("/")}
      />
    </div>
  );
}
