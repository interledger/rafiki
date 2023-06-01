
{{/* vim: set filetype=mustache: */}}
{{/*
Expand the name of the chart.
*/}}
{{- define "rafiki-backend.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "rafiki-backend.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "backend.postgresqlUrl" -}}
postgresql://{{ .Values.postgresql.username }}:{{ .Values.postgresql.password }}@{{ .Values.postgresql.host }}:{{ .Values.postgresql.port | int}}/{{ .Values.postgresql.database }}
{{- end -}}
{{- define "backend.redisUrl" -}}
redis://{{ .Values.redis.host }}:{{ .Values.redis.port }}
{{- end -}}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "rafiki-backend.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Common labels
*/}}
{{- define "rafiki-backend.labels" -}}
app: {{ include "rafiki-backend.name" . }}
app.kubernetes.io/name: {{ include "rafiki-backend.name" . }}
helm.sh/chart: {{ include "rafiki-backend.chart" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/*
Create the name of the backend service account to use
*/}}
{{- define "backend.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
    {{ default (include "rafiki-backend.fullname" .) .Values.serviceAccount.name }}
{{- else -}}
    {{ default "default" .Values.serviceAccount.name }}
{{- end -}}
{{- end -}}

{{/*
Create the backend image
*/}}
{{- define "backend.image" -}}
{{ if .Values.image.tag }}
{{- .Values.image.repository -}}:{{- .Values.image.tag -}}
{{ else if .Values.image.digest }}
{{- .Values.image.repository -}}@{{- .Values.image.digest -}}
{{ else }}
{{- .Values.image.repository -}}:latest
{{ end }}
{{- end -}}
