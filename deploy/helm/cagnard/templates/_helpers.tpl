{{- define "cagnard.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "cagnard.fullname" -}}
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

{{- define "cagnard.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "cagnard.labels" -}}
helm.sh/chart: {{ include "cagnard.chart" . }}
app.kubernetes.io/name: {{ include "cagnard.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "cagnard.selectorLabels" -}}
app.kubernetes.io/name: {{ include "cagnard.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "cagnard.backendConfigName" -}}
{{- printf "%s-backend-config" (include "cagnard.fullname" .) -}}
{{- end -}}

{{- define "cagnard.backendConfigMountPath" -}}
{{- default "/etc/cagnard" .Values.backend.config.mountPath -}}
{{- end -}}

{{- define "cagnard.backendConfigFileName" -}}
{{- default "cagnard.conf" .Values.backend.config.fileName -}}
{{- end -}}

{{- define "cagnard.backendConfigPath" -}}
{{- printf "%s/%s" (include "cagnard.backendConfigMountPath" .) (include "cagnard.backendConfigFileName" .) -}}
{{- end -}}

