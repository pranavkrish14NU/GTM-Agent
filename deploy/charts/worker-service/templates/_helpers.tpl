{{- define "worker-service.name" -}}worker-service{{- end -}}

{{- define "worker-service.fullname" -}}
{{- printf "%s-worker-service" .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "worker-service.labels" -}}
app.kubernetes.io/name: worker-service
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: worker
app.kubernetes.io/part-of: boba
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "worker-service.selectorLabels" -}}
app.kubernetes.io/name: worker-service
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}
