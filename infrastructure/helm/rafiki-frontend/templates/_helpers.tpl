
{{/* vim: set filetype=mustache: */}}
{{/*
Expand the name of the chart.
*/}}
{{- define "rafiki-frontend.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "rafiki-frontend.fullname" -}}
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

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "rafiki-frontend.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Common labels
*/}}
{{- define "rafiki-frontend.labels" -}}
app: {{ include "rafiki-frontend.name" . }}
app.kubernetes.io/name: {{ include "rafiki-frontend.name" . }}
helm.sh/chart: {{ include "rafiki-frontend.chart" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/*
Create the name of the frontend service account to use
*/}}
{{- define "frontend.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
    {{ default (include "rafiki-frontend.fullname" .) .Values.serviceAccount.name }}
{{- else -}}
    {{ default "default" .Values.serviceAccount.name }}
{{- end -}}
{{- end -}}

{{/*
Create the frontend image
*/}}
{{- define "frontend.image" -}}
{{ if .Values.image.tag }}
{{- .Values.image.repository -}}:{{- .Values.image.tag -}}
{{ else if .Values.image.digest }}
{{- .Values.image.repository -}}@{{- .Values.image.digest -}}
{{ else }}
{{- .Values.image.repository -}}:latest
{{ end }}
{{- end -}}