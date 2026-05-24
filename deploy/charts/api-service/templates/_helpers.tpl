{{- define "api-service.name" -}}api-service{{- end -}}

{{- define "api-service.fullname" -}}
{{- printf "%s-api-service" .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "api-service.labels" -}}
app.kubernetes.io/name: api-service
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: api
app.kubernetes.io/part-of: boba
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "api-service.selectorLabels" -}}
app.kubernetes.io/name: api-service
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}
