import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { getAdminClientId } from "../lib/adminClient.js";

const router = Router();

type ProjectRow = {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  goal?: string | null;
  status?: string | null;
  created_at?: string;
  updated_at?: string;
};

type MeasurementRow = {
  id: string;
  project_id: string;
  metric_name: string;
  value: number;
  unit: string;
  measured_at?: string;
  notes?: string | null;
  created_at?: string;
};

function numberPt(value: number, decimals = 1): string {
  return Number(value)
    .toFixed(decimals)
    .replace(".", ",")
    .replace(/,0+$/, "");
}

function buildProjectSummary(project: ProjectRow, measurements: MeasurementRow[]) {
  const projectMeasurements = measurements.filter(
    (item) => item.project_id === project.id
  );

  const weights = projectMeasurements
    .filter((item) => item.metric_name === "peso")
    .sort((a, b) =>
      String(a.measured_at || a.created_at || "").localeCompare(
        String(b.measured_at || b.created_at || "")
      )
    );

  const height = [...projectMeasurements]
    .filter((item) => item.metric_name === "altura")
    .pop();

  const targetWeight = [...projectMeasurements]
    .filter((item) => item.metric_name === "meta_peso")
    .pop();

  const firstWeight = weights[0];
  const currentWeight = weights[weights.length - 1];

  let progressText = "Sem progresso registrado";
  let progressPercent = 0;

  if (firstWeight && currentWeight && targetWeight) {
    const initial = Number(firstWeight.value);
    const current = Number(currentWeight.value);
    const target = Number(targetWeight.value);

    const totalToLose = initial - target;
    const alreadyLost = initial - current;

    if (totalToLose > 0) {
      progressPercent = Math.max(
        0,
        Math.min(100, Math.round((alreadyLost / totalToLose) * 100))
      );
    }

    const remaining = current - target;

    progressText = `Peso atual ${numberPt(current)}kg • faltam ${numberPt(
      Math.max(remaining, 0)
    )}kg`;
  } else if (currentWeight) {
    progressText = `Peso atual ${numberPt(Number(currentWeight.value))}kg`;
  }

  return {
    ...project,
    summary: {
      progressText,
      progressPercent,
      height: height
        ? `${numberPt(Number(height.value), 2)}${height.unit}`
        : null,
      initialWeight: firstWeight
        ? `${numberPt(Number(firstWeight.value))}${firstWeight.unit}`
        : null,
      currentWeight: currentWeight
        ? `${numberPt(Number(currentWeight.value))}${currentWeight.unit}`
        : null,
      targetWeight: targetWeight
        ? `${numberPt(Number(targetWeight.value))}${targetWeight.unit}`
        : null,
      measurementsCount: projectMeasurements.length,
    },
  };
}

async function listProjectsWithSummary(adminClientId: string | null) {
  let projQ = supabase
    .from("projects")
    .select("*")
    .order("updated_at", { ascending: false });

  // Filtra apenas projetos do administrador
  if (adminClientId) {
    projQ = projQ.eq("client_id", adminClientId);
  }

  const { data: projects, error: projectsError } = await projQ;

  if (projectsError) {
    throw projectsError;
  }

  if (!projects?.length) return [];

  // Busca medições apenas dos projetos filtrados
  const projectIds = (projects as ProjectRow[]).map((p) => p.id);

  const { data: measurements, error: measurementsError } = await supabase
    .from("project_measurements")
    .select("*")
    .in("project_id", projectIds)
    .order("measured_at", { ascending: true });

  if (measurementsError) {
    throw measurementsError;
  }

  return ((projects || []) as ProjectRow[]).map((project) =>
    buildProjectSummary(project, (measurements || []) as MeasurementRow[])
  );
}

router.get("/projects", async (_req, res) => {
  try {
    const adminClientId = await getAdminClientId();
    const data = await listProjectsWithSummary(adminClientId);

    return res.json({
      status: "ok",
      data,
    });
  } catch (error: any) {
    return res.status(500).json({
      status: "error",
      message: "Falha ao listar projetos",
      details: error?.message || "unknown error",
    });
  }
});

router.get("/api/projects", async (_req, res) => {
  try {
    const adminClientId = await getAdminClientId();
    const data = await listProjectsWithSummary(adminClientId);

    return res.json({
      status: "ok",
      data,
    });
  } catch (error: any) {
    return res.status(500).json({
      status: "error",
      message: "Falha ao listar projetos",
      details: error?.message || "unknown error",
    });
  }
});

export default router;