CREATE USER backend WITH PASSWORD 'backend';
CREATE DATABASE backend;
ALTER DATABASE backend OWNER TO backend;

CREATE USER auth WITH PASSWORD 'auth';
CREATE DATABASE auth;
ALTER DATABASE auth OWNER TO auth;

CREATE USER peerbackend WITH PASSWORD 'peerbackend';
CREATE DATABASE peerbackend;
ALTER DATABASE peerbackend OWNER TO peerbackend;

CREATE USER peerauth WITH PASSWORD 'peerauth';
CREATE DATABASE peerauth;
ALTER DATABASE peerauth OWNER TO peerauth;
