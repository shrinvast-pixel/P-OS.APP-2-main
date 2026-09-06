import { useState, useEffect } from 'react';
import type { PaintProject } from '@/types';
import { Dashboard } from '@/components/Dashboard';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useTheme } from '@/components/useTheme';
import { demoProjects } from '@/demoData';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { cleanupStaleBase64FromStorage, ensureExteriorFloors, ensureExteriorMaterials, computeEstimatedDays, addWorkingDays } from '@/utils';

function App() {
  const [projects, setProjects] = useState<PaintProject[]>(() => {
    // Run cleanup on initial app load if existing storage is close to 5MB
    try {
      cleanupStaleBase64FromStorage('paintship_projects');
    } catch (e) {
      console.warn('[LocalStorage] Initial cleanup error:', e);
    }

    try {
      const saved = localStorage.getItem('paintship_projects');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Migration: materialize Exterior walls as a navigable floor/zone so
          // exterior tasks appear in the Supervisor panel & Painter Portal.
          return ensureExteriorFloors(parsed).map((p) => {
            const sourceDays = p.projectDetails.estimatedDays ?? 0;
            const totalSqft = (p.interiorSqft ?? 0) + (p.exteriorSqft ?? 0)
              + (p.woodAndMetalItems ?? []).reduce((s, i) => s + (i.totalSqft ?? 0), 0)
              + (p.specialFeatures?.wallpapers ?? []).reduce((s, w) => s + (w.totalSqft ?? w.areaSqft ?? 0), 0)
              + (p.specialFeatures?.textures ?? []).reduce((s, t) => s + (t.totalSqft ?? t.areaSqft ?? 0), 0);
            const computed = computeEstimatedDays(p);
            const shouldOverride = totalSqft > 1000 && sourceDays < 5;
            const days = shouldOverride || sourceDays === 0 ? computed : sourceDays;
            const start = p.projectDetails.startDate ?? p.projectDetails.createdAt ?? new Date().toISOString().split('T')[0];
            return {
              ...p,
              projectDetails: {
                ...p.projectDetails,
                estimatedDays: days,
                endDate: addWorkingDays(start, days),
              },
              summaryMetrics: { ...p.summaryMetrics, estimatedTotalDays: days },
            };
          }).map(ensureExteriorMaterials);
        }
      }
    } catch (e) {
      console.error('Error parsing projects from localStorage', e);
    }
    return ensureExteriorFloors(demoProjects).map((p) => {
      const sourceDays = p.projectDetails.estimatedDays ?? 0;
      const totalSqft = (p.interiorSqft ?? 0) + (p.exteriorSqft ?? 0)
        + (p.woodAndMetalItems ?? []).reduce((s, i) => s + (i.totalSqft ?? 0), 0)
        + (p.specialFeatures?.wallpapers ?? []).reduce((s, w) => s + (w.totalSqft ?? w.areaSqft ?? 0), 0)
        + (p.specialFeatures?.textures ?? []).reduce((s, t) => s + (t.totalSqft ?? t.areaSqft ?? 0), 0);
      const computed = computeEstimatedDays(p);
      const shouldOverride = totalSqft > 1000 && sourceDays < 5;
      const days = shouldOverride || sourceDays === 0 ? computed : sourceDays;
      const start = p.projectDetails.startDate ?? p.projectDetails.createdAt ?? new Date().toISOString().split('T')[0];
      return {
        ...p,
        projectDetails: {
          ...p.projectDetails,
          estimatedDays: days,
          endDate: addWorkingDays(start, days),
        },
        summaryMetrics: { ...p.summaryMetrics, estimatedTotalDays: days },
      };
    }).map(ensureExteriorMaterials);
  });

  const { theme, toggle } = useTheme();

  useEffect(() => {
    try {
      localStorage.setItem('paintship_projects', JSON.stringify(projects));
    } catch (err) {
      console.warn('[LocalStorage] QuotaExceededError encountered when saving projects. Falling back to in-memory state.', err);
      try {
        // Attempt saving stripped projects without heavy Base64 strings to preserve essential step metadata
        const strippedProjects = projects.map((proj) => ({
          ...proj,
          floors: (proj.floors ?? []).map((floor) => ({
            ...floor,
            rooms: (floor.rooms ?? []).map((room) => ({
              ...room,
              finishingSteps: (room.finishingSteps ?? []).map((step) => ({
                ...step,
                beforePhotoUrl: step.beforePhotoUrl?.startsWith('data:image') ? undefined : step.beforePhotoUrl,
                beforePhoto: step.beforePhoto?.startsWith('data:image') ? undefined : step.beforePhoto,
                afterPhotoUrl: step.afterPhotoUrl?.startsWith('data:image') ? undefined : step.afterPhotoUrl,
                afterPhoto: step.afterPhoto?.startsWith('data:image') ? undefined : step.afterPhoto,
                completionPhoto: step.completionPhoto?.startsWith('data:image') ? undefined : step.completionPhoto,
                proofPhotos: (step.proofPhotos ?? []).filter((p) => !p.startsWith('data:image')),
              })),
            })),
          })),
        }));
        localStorage.setItem('paintship_projects', JSON.stringify(strippedProjects));
      } catch (innerErr) {
        console.warn('[LocalStorage] Stripped backup save also failed; relying purely on in-memory state.', innerErr);
      }
    }
  }, [projects]);

  return (
    <div className="relative min-h-screen">
      <div className="absolute right-4 top-3 z-30">
        <ThemeToggle theme={theme} onToggle={toggle} />
      </div>
      <ErrorBoundary fallbackTitle="Application View Error">
        <Dashboard
          projects={projects}
          onProjectsChange={setProjects}
        />
      </ErrorBoundary>
    </div>
  );
}

export default App;
