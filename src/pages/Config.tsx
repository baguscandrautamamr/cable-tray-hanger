import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { useTranslation } from "../i18n/useTranslation";
import HangerConfigForm from "../components/HangerConfigForm";
import PageHeader from "../components/PageHeader";

interface ConfigProps {
  session: Session;

  /** Shown until a scan arrives and names the project itself. May be empty. */
  fallbackProjectName: string;
}

export default function Config({ session, fallbackProjectName }: ConfigProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // The project is whatever the add-in scanned under, not a build-time
  // constant that has to be kept in step with the Settings dialog by hand.
  const [projectName, setProjectName] = useState<string | null>(null);

  const handleProjectName = useCallback((name: string) => setProjectName(name), []);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <PageHeader
        session={session}
        backTo="/"
        title={t("config.title")}
        // An empty VITE_PROJECT_NAME renders no line at all rather than a blank
        // one: the form below already says in full that no scan has arrived.
        subtitle={projectName ?? fallbackProjectName}
      />

      <HangerConfigForm
        session={session}
        onProjectName={handleProjectName}
        onSaved={() => navigate("/")}
      />
    </div>
  );
}
