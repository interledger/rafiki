
{{/* vim: set filetype=mustache: */}}
{{/*
Expand the name of the chart.
*/}}
{{- define "rafiki-auth.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "rafiki-auth.fullname" -}}
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

{{- define "auth.postgresqlUrl" -}}
postgresql://{{ .Values.postgresql.username }}:{{ .Values.postgresql.password }}@{{ .Values.postgresql.host }}:{{ .Values.postgresql.port | int}}/{{ .Values.postgresql.database }}
{{- end -}}
{{- define "auth.grantUrl" -}}
http://{{ include "rafiki-auth.fullname" . }}:{{ .Values.port.auth }}
{{- end -}}
{{- define "auth.introspectionUrl" -}}
http://{{ include "rafiki-auth.fullname" . }}:{{ .Values.port.introspection }}
{{- end -}}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "rafiki-auth.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Common labels
*/}}
{{- define "rafiki-auth.labels" -}}
app: {{ include "rafiki-auth.name" . }}
app.kubernetes.io/name: {{ include "rafiki-auth.name" . }}
helm.sh/chart: {{ include "rafiki-auth.chart" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/*
Create the name of the auth service account to use
*/}}
{{- define "auth.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
    {{ default (include "rafiki-auth.fullname" .) .Values.serviceAccount.name }}
{{- else -}}
    {{ default "default" .Values.serviceAccount.name }}
{{- end -}}
{{- end -}}

{{/*
Create the auth image
*/}}
{{- define "auth.image" -}}
{{ if .Values.image.tag }}
{{- .Values.image.repository -}}:{{- .Values.image.tag -}}
{{ else if .Values.image.digest }}
{{- .Values.image.repository -}}@{{- .Values.image.digest -}}
{{ else }}
{{- .Values.image.repository -}}:latest
{{ end }}
{{- end -}}