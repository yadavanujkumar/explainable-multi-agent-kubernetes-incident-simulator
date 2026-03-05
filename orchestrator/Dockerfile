FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY go.mod ./ 
# COPY go.sum ./ 
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o orchestrator .

FROM alpine:latest
WORKDIR /root/
COPY --from=builder /app/orchestrator .
EXPOSE 8080
CMD ["./orchestrator"]
