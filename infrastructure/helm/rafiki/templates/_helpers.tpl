
{{/* vim: set filetype=mustache: */}}
{{/*
Expand the name of the chart.
*/}}
{{- define "rafiki.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "rafiki.fullname" -}}
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

{{- define "backend.name" -}}
{{ include "rafiki.fullname" . }}-backend
{{- end -}}
{{- define "backend.postgresqlUrl" -}}
postgresql://{{ .Values.backend.postgresql.username }}:{{ .Values.backend.postgresql.password }}@{{ .Values.backend.postgresql.host }}:{{ .Values.backend.postgresql.port | int}}/{{ .Values.backend.postgresql.database }}
{{- end -}}
{{- define "backend.redisUrl" -}}
redis://{{ .Values.backend.redis.host }}:{{ .Values.backend.redis.port }}/{{ .Values.backend.redis.databaseIndex }}
{{- end -}}


{{- define "auth.name" -}}
{{ include "rafiki.fullname" . }}-auth
{{- end -}}
{{- define "auth.postgresqlUrl" -}}
postgresql://{{ .Values.auth.postgresql.username }}:{{ .Values.auth.postgresql.password }}@{{ .Values.auth.postgresql.host }}:{{ .Values.auth.postgresql.port | int}}/{{ .Values.auth.postgresql.database }}
{{- end -}}
{{- define "auth.redisUrl" -}}
redis://{{ .Values.auth.redis.host }}:{{ .Values.auth.redis.port }}/{{ .Values.auth.redis.databaseIndex }}
{{- end -}}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "rafiki.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Common labels
*/}}
{{- define "rafiki.labels" -}}
app: {{ include "rafiki.name" . }}
app.kubernetes.io/name: {{ include "rafiki.name" . }}
helm.sh/chart: {{ include "rafiki.chart" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/*
Create the name of the service account to use
*/}}
{{- define "auth.serviceAccountName" -}}
{{- if .Values.auth.serviceAccount.create -}}
    {{ default (include "auth.name" .) .Values.auth.serviceAccount.name }}
{{- else -}}
    {{ default "default" .Values.auth.serviceAccount.name }}
{{- end -}}
{{- end -}}

{{/*
Create the name of the service account to use
*/}}
{{- define "backend.serviceAccountName" -}}
{{- if .Values.backend.serviceAccount.create -}}
    {{ default (include "backend.name" .) .Values.backend.serviceAccount.name }}
{{- else -}}
    {{ default "default" .Values.backend.serviceAccount.name }}
{{- end -}}
{{- end -}}

{{/*
Create the backend image
*/}}
{{- define "backend.image" -}}
{{ if .Values.backend.image.tag }}
{{- .Values.backend.image.repository -}}:{{- .Values.backend.image.tag -}}
{{ else if .Values.backend.image.digest }}
{{- .Values.backend.image.repository -}}@{{- .Values.backend.image.digest -}}
{{ else }}
{{- .Values.backend.image.repository -}}:latest
{{ end }}
{{- end -}}

{{/*
Create the auth image
*/}}
{{- define "auth.image" -}}
{{ if .Values.auth.image.tag }}
{{- .Values.auth.image.repository -}}:{{- .Values.auth.image.tag -}}
{{ else if .Values.auth.image.digest }}
{{- .Values.auth.image.repository -}}@{{- .Values.auth.image.digest -}}
{{ else }}
{{- .Values.auth.image.repository -}}:latest
{{ end }}
{{- end -}}
