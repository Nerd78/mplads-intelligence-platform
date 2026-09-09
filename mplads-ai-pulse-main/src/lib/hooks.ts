import { useQuery } from "@tanstack/react-query";

import { api, type MapMetric, type WorksFilters } from "./api";

export function useWorks(filters: WorksFilters = {}) {
  return useQuery({
    queryKey: ["works", filters],
    queryFn: () => api.works(filters),
    placeholderData: (prev) => prev,
  });
}

export function useWorkDetail(workId: string | undefined) {
  return useQuery({
    queryKey: ["work", workId],
    queryFn: () => api.work(workId as string),
    enabled: !!workId,
  });
}

export function usePayments(filters: Parameters<typeof api.payments>[0] = {}) {
  return useQuery({
    queryKey: ["payments", filters],
    queryFn: () => api.payments(filters),
    placeholderData: (prev) => prev,
  });
}

export function useMps(filters: Parameters<typeof api.mps>[0] = {}) {
  return useQuery({
    queryKey: ["mps", filters],
    queryFn: () => api.mps(filters),
    placeholderData: (prev) => prev,
  });
}

export function useMpDetail(mpId: string | undefined) {
  return useQuery({
    queryKey: ["mp", mpId],
    queryFn: () => api.mp(mpId as string),
    enabled: !!mpId,
  });
}

export function useAlerts(filters: Parameters<typeof api.alerts>[0] = {}) {
  return useQuery({
    queryKey: ["alerts", filters],
    queryFn: () => api.alerts(filters),
    placeholderData: (prev) => prev,
  });
}

export function useGeoStates(metric?: MapMetric) {
  return useQuery({ queryKey: ["geo-states", metric], queryFn: () => api.geoStates(metric), staleTime: 60_000 });
}

export function useGeoPoints() {
  return useQuery({ queryKey: ["geo-points"], queryFn: api.geoPoints, staleTime: 60_000 });
}

export function useStateNameMap() {
  return useQuery({ queryKey: ["state-name-map"], queryFn: api.stateNameMap, staleTime: Infinity });
}

export function useStatsOverview() {
  return useQuery({ queryKey: ["stats-overview"], queryFn: api.statsOverview, staleTime: 30_000 });
}

export function useStatsState(state: string | undefined) {
  return useQuery({
    queryKey: ["stats-state", state],
    queryFn: () => api.statsState(state as string),
    enabled: !!state,
  });
}

export function useStatsDistrict(district: string | undefined, state: string | undefined) {
  return useQuery({
    queryKey: ["stats-district", state, district],
    queryFn: () => api.statsDistrict(district as string, state as string),
    enabled: !!district && !!state,
  });
}

export function useEvaluation() {
  return useQuery({ queryKey: ["evaluation"], queryFn: api.evaluation, staleTime: 60_000 });
}
