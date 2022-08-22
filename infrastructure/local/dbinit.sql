CREATE USER backend WITH PASSWORD 'backend';
CREATE DATABASE backend;
GRANT ALL ON DATABASE backend TO backend;

CREATE USER auth WITH PASSWORD 'auth';
CREATE DATABASE auth;
GRANT ALL ON DATABASE auth TO auth;

CREATE USER peerbackend WITH PASSWORD 'peerbackend';
CREATE DATABASE peerbackend;
GRANT ALL ON DATABASE peerbackend TO peerbackend;

CREATE USER peerauth WITH PASSWORD 'peerauth';
CREATE DATABASE peerauth;
GRANT ALL ON DATABASE peerauth TO peerauth;
