{{- define "platform-ingress.fullname" -}}
{{- printf "%s-platform-ingress" .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "platform-ingress.labels" -}}
app.kubernetes.io/name: platform-ingress
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/part-of: boba
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}
