--
-- PostgreSQL database dump
--

-- Dumped from database version 15.8 (Debian 15.8-1.pgdg120+1)
-- Dumped by pg_dump version 15.8 (Debian 15.8-1.pgdg120+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: assets; Type: TABLE; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE TABLE public.assets (
    id uuid NOT NULL,
    ledger smallint NOT NULL,
    code character varying(255) NOT NULL,
    scale smallint NOT NULL,
    "withdrawalThreshold" bigint,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "liquidityThreshold" bigint,
    "deletedAt" timestamp with time zone,
    CONSTRAINT assets_scale_check CHECK ((scale <= 255))
);


ALTER TABLE public.assets OWNER TO cloud_nine_wallet_backend;

--
-- Name: assets_ledger_seq; Type: SEQUENCE; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE SEQUENCE public.assets_ledger_seq
    AS smallint
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.assets_ledger_seq OWNER TO cloud_nine_wallet_backend;

--
-- Name: assets_ledger_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER SEQUENCE public.assets_ledger_seq OWNED BY public.assets.ledger;


--
-- Name: authServers; Type: TABLE; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE TABLE public."authServers" (
    id uuid NOT NULL,
    url character varying(255) NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public."authServers" OWNER TO cloud_nine_wallet_backend;

--
-- Name: incomingPayments; Type: TABLE; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE TABLE public."incomingPayments" (
    id uuid NOT NULL,
    "walletAddressId" uuid NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "incomingAmountValue" bigint,
    state character varying(255) NOT NULL,
    client character varying(255),
    "assetId" uuid NOT NULL,
    "processAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    metadata jsonb,
    "approvedAt" timestamp with time zone,
    "cancelledAt" timestamp with time zone
);


ALTER TABLE public."incomingPayments" OWNER TO cloud_nine_wallet_backend;

--
-- Name: outgoingPayments; Type: TABLE; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE TABLE public."outgoingPayments" (
    id uuid NOT NULL,
    state character varying(255) NOT NULL,
    error character varying(255),
    "stateAttempts" integer DEFAULT 0 NOT NULL,
    client character varying(255),
    "grantId" character varying(255),
    "walletAddressId" uuid NOT NULL,
    "peerId" uuid,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    metadata jsonb
);


ALTER TABLE public."outgoingPayments" OWNER TO cloud_nine_wallet_backend;

--
-- Name: combinedPaymentsView; Type: VIEW; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE VIEW public."combinedPaymentsView" AS
 SELECT "incomingPayments".id,
    "incomingPayments"."walletAddressId",
    "incomingPayments".state,
    "incomingPayments".client,
    "incomingPayments"."createdAt",
    "incomingPayments"."updatedAt",
    "incomingPayments".metadata,
    'INCOMING'::text AS type
   FROM public."incomingPayments"
UNION ALL
 SELECT "outgoingPayments".id,
    "outgoingPayments"."walletAddressId",
    "outgoingPayments".state,
    "outgoingPayments".client,
    "outgoingPayments"."createdAt",
    "outgoingPayments"."updatedAt",
    "outgoingPayments".metadata,
    'OUTGOING'::text AS type
   FROM public."outgoingPayments";


ALTER TABLE public."combinedPaymentsView" OWNER TO cloud_nine_wallet_backend;

--
-- Name: fees; Type: TABLE; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE TABLE public.fees (
    id uuid NOT NULL,
    "assetId" uuid NOT NULL,
    type text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "fixedFee" bigint NOT NULL,
    "basisPointFee" integer NOT NULL,
    CONSTRAINT fees_basispointfee_check CHECK ((("basisPointFee" >= 0) AND ("basisPointFee" <= 10000))),
    CONSTRAINT fees_fixedfee_check CHECK (("fixedFee" >= 0)),
    CONSTRAINT fees_type_check CHECK ((type = ANY (ARRAY['SENDING'::text, 'RECEIVING'::text])))
);


ALTER TABLE public.fees OWNER TO cloud_nine_wallet_backend;

--
-- Name: grants; Type: TABLE; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE TABLE public.grants (
    id uuid NOT NULL,
    "authServerId" uuid NOT NULL,
    "continueId" character varying(255),
    "continueToken" character varying(255),
    "accessToken" character varying(255) NOT NULL,
    "managementId" character varying(255) NOT NULL,
    "accessType" character varying(255) NOT NULL,
    "accessActions" text[],
    "expiresAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" timestamp with time zone
);


ALTER TABLE public.grants OWNER TO cloud_nine_wallet_backend;

--
-- Name: httpTokens; Type: TABLE; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE TABLE public."httpTokens" (
    id uuid NOT NULL,
    token character varying(255) NOT NULL,
    "peerId" uuid NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public."httpTokens" OWNER TO cloud_nine_wallet_backend;

--
-- Name: ilpQuoteDetails; Type: TABLE; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE TABLE public."ilpQuoteDetails" (
    id uuid NOT NULL,
    "quoteId" uuid NOT NULL,
    "maxPacketAmount" bigint NOT NULL,
    "minExchangeRateNumerator" numeric(64,0) NOT NULL,
    "minExchangeRateDenominator" numeric(64,0) NOT NULL,
    "lowEstimatedExchangeRateNumerator" numeric(64,0) NOT NULL,
    "lowEstimatedExchangeRateDenominator" numeric(64,0) NOT NULL,
    "highEstimatedExchangeRateNumerator" numeric(64,0) NOT NULL,
    "highEstimatedExchangeRateDenominator" numeric(64,0) NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public."ilpQuoteDetails" OWNER TO cloud_nine_wallet_backend;

--
-- Name: knex_migrations; Type: TABLE; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE TABLE public.knex_migrations (
    id integer NOT NULL,
    name character varying(255),
    batch integer,
    migration_time timestamp with time zone
);


ALTER TABLE public.knex_migrations OWNER TO cloud_nine_wallet_backend;

--
-- Name: knex_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE SEQUENCE public.knex_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.knex_migrations_id_seq OWNER TO cloud_nine_wallet_backend;

--
-- Name: knex_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER SEQUENCE public.knex_migrations_id_seq OWNED BY public.knex_migrations.id;


--
-- Name: knex_migrations_lock; Type: TABLE; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE TABLE public.knex_migrations_lock (
    index integer NOT NULL,
    is_locked integer
);


ALTER TABLE public.knex_migrations_lock OWNER TO cloud_nine_wallet_backend;

--
-- Name: knex_migrations_lock_index_seq; Type: SEQUENCE; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE SEQUENCE public.knex_migrations_lock_index_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.knex_migrations_lock_index_seq OWNER TO cloud_nine_wallet_backend;

--
-- Name: knex_migrations_lock_index_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER SEQUENCE public.knex_migrations_lock_index_seq OWNED BY public.knex_migrations_lock.index;


--
-- Name: ledgerAccounts; Type: TABLE; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE TABLE public."ledgerAccounts" (
    id uuid NOT NULL,
    "accountRef" uuid NOT NULL,
    ledger smallint NOT NULL,
    type text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ledgerAccounts_type_check" CHECK ((type = ANY (ARRAY['LIQUIDITY_ASSET'::text, 'LIQUIDITY_PEER'::text, 'LIQUIDITY_INCOMING'::text, 'LIQUIDITY_OUTGOING'::text, 'LIQUIDITY_WEB_MONETIZATION'::text, 'SETTLEMENT'::text])))
);


ALTER TABLE public."ledgerAccounts" OWNER TO cloud_nine_wallet_backend;

--
-- Name: ledgerTransfers; Type: TABLE; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE TABLE public."ledgerTransfers" (
    id uuid NOT NULL,
    "transferRef" uuid NOT NULL,
    "debitAccountId" uuid NOT NULL,
    "creditAccountId" uuid NOT NULL,
    amount bigint NOT NULL,
    ledger smallint NOT NULL,
    "expiresAt" timestamp with time zone,
    state text NOT NULL,
    type text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_pending_requires_expires_at CHECK (((state <> 'PENDING'::text) OR ("expiresAt" IS NOT NULL))),
    CONSTRAINT "ledgerTransfers_amount_check" CHECK ((amount > 0)),
    CONSTRAINT "ledgerTransfers_state_check" CHECK ((state = ANY (ARRAY['PENDING'::text, 'POSTED'::text, 'VOIDED'::text]))),
    CONSTRAINT "ledgerTransfers_type_check" CHECK ((type = ANY (ARRAY['WITHDRAWAL'::text, 'DEPOSIT'::text])))
);


ALTER TABLE public."ledgerTransfers" OWNER TO cloud_nine_wallet_backend;

--
-- Name: outgoingPaymentGrants; Type: TABLE; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE TABLE public."outgoingPaymentGrants" (
    id character varying(255) NOT NULL
);


ALTER TABLE public."outgoingPaymentGrants" OWNER TO cloud_nine_wallet_backend;

--
-- Name: peers; Type: TABLE; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE TABLE public.peers (
    id uuid NOT NULL,
    "assetId" uuid NOT NULL,
    "maxPacketAmount" bigint,
    "staticIlpAddress" character varying(255) NOT NULL,
    "outgoingToken" character varying(255),
    "outgoingEndpoint" character varying(255),
    name character varying(255),
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "liquidityThreshold" bigint
);


ALTER TABLE public.peers OWNER TO cloud_nine_wallet_backend;

--
-- Name: quotes; Type: TABLE; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE TABLE public.quotes (
    id uuid NOT NULL,
    receiver character varying(255) NOT NULL,
    "debitAmountValue" bigint NOT NULL,
    "receiveAmountValue" bigint NOT NULL,
    "receiveAmountAssetCode" character varying(255) NOT NULL,
    "receiveAmountAssetScale" integer NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "walletAddressId" uuid NOT NULL,
    "assetId" uuid NOT NULL,
    client character varying(255),
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "feeId" uuid,
    "estimatedExchangeRate" numeric(20,10) NOT NULL,
    "debitAmountMinusFees" bigint
);


ALTER TABLE public.quotes OWNER TO cloud_nine_wallet_backend;

--
-- Name: walletAddressAdditionalProperties; Type: TABLE; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE TABLE public."walletAddressAdditionalProperties" (
    id uuid NOT NULL,
    "fieldKey" character varying(255) NOT NULL,
    "fieldValue" character varying(255) NOT NULL,
    "visibleInOpenPayments" boolean DEFAULT false NOT NULL,
    "walletAddressId" uuid NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public."walletAddressAdditionalProperties" OWNER TO cloud_nine_wallet_backend;

--
-- Name: walletAddressKeys; Type: TABLE; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE TABLE public."walletAddressKeys" (
    id uuid NOT NULL,
    "walletAddressId" uuid NOT NULL,
    kid character varying(255) NOT NULL,
    x character varying(255) NOT NULL,
    revoked boolean DEFAULT false NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public."walletAddressKeys" OWNER TO cloud_nine_wallet_backend;

--
-- Name: walletAddresses; Type: TABLE; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE TABLE public."walletAddresses" (
    id uuid NOT NULL,
    url character varying(255) NOT NULL,
    "assetId" uuid NOT NULL,
    "publicName" character varying(255),
    "totalEventsAmount" bigint DEFAULT '0'::bigint NOT NULL,
    "processAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "deactivatedAt" timestamp with time zone
);


ALTER TABLE public."walletAddresses" OWNER TO cloud_nine_wallet_backend;

--
-- Name: webhookEvents; Type: TABLE; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE TABLE public."webhookEvents" (
    id uuid NOT NULL,
    type character varying(255) NOT NULL,
    data json NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    "statusCode" integer,
    "withdrawalAccountId" uuid,
    "withdrawalAssetId" uuid,
    "withdrawalAmount" bigint,
    "processAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "outgoingPaymentId" uuid,
    "incomingPaymentId" uuid,
    "walletAddressId" uuid,
    "peerId" uuid,
    "assetId" uuid,
    CONSTRAINT webhookevents_related_resource_constraint CHECK (
CASE
    WHEN ((type)::text <> 'wallet_address.not_found'::text) THEN ((((((("outgoingPaymentId" IS NOT NULL))::integer + (("incomingPaymentId" IS NOT NULL))::integer) + (("walletAddressId" IS NOT NULL))::integer) + (("peerId" IS NOT NULL))::integer) + (("assetId" IS NOT NULL))::integer) = 1)
    ELSE ((((((("outgoingPaymentId" IS NOT NULL))::integer + (("incomingPaymentId" IS NOT NULL))::integer) + (("walletAddressId" IS NOT NULL))::integer) + (("peerId" IS NOT NULL))::integer) + (("assetId" IS NOT NULL))::integer) = 0)
END)
);


ALTER TABLE public."webhookEvents" OWNER TO cloud_nine_wallet_backend;

--
-- Name: assets ledger; Type: DEFAULT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public.assets ALTER COLUMN ledger SET DEFAULT nextval('public.assets_ledger_seq'::regclass);


--
-- Name: knex_migrations id; Type: DEFAULT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public.knex_migrations ALTER COLUMN id SET DEFAULT nextval('public.knex_migrations_id_seq'::regclass);


--
-- Name: knex_migrations_lock index; Type: DEFAULT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public.knex_migrations_lock ALTER COLUMN index SET DEFAULT nextval('public.knex_migrations_lock_index_seq'::regclass);


--
-- Data for Name: assets; Type: TABLE DATA; Schema: public; Owner: cloud_nine_wallet_backend
--

COPY public.assets (id, ledger, code, scale, "withdrawalThreshold", "createdAt", "updatedAt", "liquidityThreshold", "deletedAt") FROM stdin;
e9dc256b-de44-4c49-981e-cee051c66a8a	1	USD	2	\N	2024-10-22 13:26:09.261579+00	2024-10-22 13:26:09.261579+00	10000000	\N
81f94b29-1a66-4931-baf4-4b5d17da35d3	2	EUR	2	\N	2024-10-22 13:26:09.308522+00	2024-10-22 13:26:09.308522+00	10000000	\N
5391cf5b-bcb2-4ce3-bd20-cef0e300d43a	3	MXN	2	\N	2024-10-22 13:26:09.34146+00	2024-10-22 13:26:09.34146+00	10000000	\N
e2f94faf-a7b5-4550-b927-43e9ca53c7a7	4	JPY	0	\N	2024-10-22 13:26:09.371555+00	2024-10-22 13:26:09.371555+00	100000	\N
\.


--
-- Data for Name: authServers; Type: TABLE DATA; Schema: public; Owner: cloud_nine_wallet_backend
--

COPY public."authServers" (id, url, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: fees; Type: TABLE DATA; Schema: public; Owner: cloud_nine_wallet_backend
--

COPY public.fees (id, "assetId", type, "createdAt", "fixedFee", "basisPointFee") FROM stdin;
7d166103-bfac-4b5d-aecb-ea977bb6be48	e9dc256b-de44-4c49-981e-cee051c66a8a	SENDING	2024-10-22 13:26:09.301574+00	100	200
dd0e8c49-de54-4141-a5b7-3229c3fa9743	81f94b29-1a66-4931-baf4-4b5d17da35d3	SENDING	2024-10-22 13:26:09.330992+00	100	200
149ace7e-4732-4b3f-ac9d-2d64cbeec160	5391cf5b-bcb2-4ce3-bd20-cef0e300d43a	SENDING	2024-10-22 13:26:09.361078+00	100	200
5cd8c9e1-addb-47cc-876a-f3c2b1dc13e3	e2f94faf-a7b5-4550-b927-43e9ca53c7a7	SENDING	2024-10-22 13:26:09.392961+00	1	200
\.


--
-- Data for Name: grants; Type: TABLE DATA; Schema: public; Owner: cloud_nine_wallet_backend
--

COPY public.grants (id, "authServerId", "continueId", "continueToken", "accessToken", "managementId", "accessType", "accessActions", "expiresAt", "createdAt", "updatedAt", "deletedAt") FROM stdin;
\.


--
-- Data for Name: httpTokens; Type: TABLE DATA; Schema: public; Owner: cloud_nine_wallet_backend
--

COPY public."httpTokens" (id, token, "peerId", "createdAt", "updatedAt") FROM stdin;
b8b0efc3-2e84-48fc-9639-495345196b6f	test-USD	2f5df6a2-4859-4a43-9d68-e3f0175b176f	2024-10-22 13:26:09.408041+00	2024-10-22 13:26:09.408041+00
\.


--
-- Data for Name: ilpQuoteDetails; Type: TABLE DATA; Schema: public; Owner: cloud_nine_wallet_backend
--

COPY public."ilpQuoteDetails" (id, "quoteId", "maxPacketAmount", "minExchangeRateNumerator", "minExchangeRateDenominator", "lowEstimatedExchangeRateNumerator", "lowEstimatedExchangeRateDenominator", "highEstimatedExchangeRateNumerator", "highEstimatedExchangeRateDenominator", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: incomingPayments; Type: TABLE DATA; Schema: public; Owner: cloud_nine_wallet_backend
--

COPY public."incomingPayments" (id, "walletAddressId", "expiresAt", "incomingAmountValue", state, client, "assetId", "processAt", "createdAt", "updatedAt", metadata, "approvedAt", "cancelledAt") FROM stdin;
\.


--
-- Data for Name: knex_migrations; Type: TABLE DATA; Schema: public; Owner: cloud_nine_wallet_backend
--

COPY public.knex_migrations (id, name, batch, migration_time) FROM stdin;
1	20210422134422_create_events_table.js	1	2024-10-22 13:26:06.929+00
2	20210422194130_create_assets_table.js	1	2024-10-22 13:26:06.937+00
3	20211012172409_create_payment_pointers_table.js	1	2024-10-22 13:26:06.946+00
4	20211026133430_create_peers_table.js	1	2024-10-22 13:26:06.957+00
5	20211029103842_create_http_tokens_table.js	1	2024-10-22 13:26:06.966+00
6	20220131110501_create_webhook_events_table.js	1	2024-10-22 13:26:06.973+00
7	20220819120358_create_payment_pointer_keys_table.js	1	2024-10-22 13:26:06.977+00
8	20220908085845_create_incoming_payments_table.js	1	2024-10-22 13:26:06.987+00
9	20221005181411_create_auth_servers_table.js	1	2024-10-22 13:26:06.992+00
10	20221012013413_create_grants_table.js	1	2024-10-22 13:26:07.001+00
11	20221012205150_create_quotes_table.js	1	2024-10-22 13:26:07.007+00
12	20221129213740_create_outgoing_payment_grants_table.js	1	2024-10-22 13:26:07.01+00
13	20221129213751_create_outgoing_payments_table.js	1	2024-10-22 13:26:07.02+00
14	20230201133042_create_ledger_accounts_table.js	1	2024-10-22 13:26:07.027+00
15	20230202124709_create_ledger_transfers_table.js	1	2024-10-22 13:26:07.04+00
16	20230629094019_drop_events_table.js	1	2024-10-22 13:26:07.041+00
17	20230629094400_add_deactivatedat_payment_pointers.js	1	2024-10-22 13:26:07.042+00
18	20230629122543_update_payments_tables.js	1	2024-10-22 13:26:07.045+00
19	20230718142550_create_combined_payments_view.js	1	2024-10-22 13:26:07.046+00
20	20230731141948_create_fee_table.js	1	2024-10-22 13:26:07.052+00
21	20230814152458_add_fee_quotes.js	1	2024-10-22 13:26:07.053+00
22	20230904145439_rename-quote-sendamountvalue.js	1	2024-10-22 13:26:07.054+00
23	20230907130701_add_peer_index.js	1	2024-10-22 13:26:07.055+00
24	20230912091917_add_liquidityThreshold_assets.js	1	2024-10-22 13:26:07.056+00
25	20230912091925_add_liquidityThreshold_peers.js	1	2024-10-22 13:26:07.056+00
26	20230918113102_rename_payment_pointer_tables.js	1	2024-10-22 13:26:07.072+00
27	20230927223235_make_quotes_generic.js	1	2024-10-22 13:26:07.073+00
28	20231019142543_drop_connections_from_incoming_payment.js	1	2024-10-22 13:26:07.073+00
29	20231121184537_add_resource_fkeys_webhook_event.js	1	2024-10-22 13:26:07.089+00
30	20240502132505_add_deleted_at_to_assets.js	1	2024-10-22 13:26:07.089+00
31	20240524102509_update_quote_ratio_columns.js	1	2024-10-22 13:26:07.12+00
32	20240528184537_create_wallet_add_props.js	1	2024-10-22 13:26:07.134+00
33	20240729210134_incoming_payment_cancel_approved_timestamp.js	1	2024-10-22 13:26:07.134+00
34	20240820101201_add_deleted_at_grants.js	1	2024-10-22 13:26:07.135+00
35	20240820161040_add_ledger_transfer_constraint.js	1	2024-10-22 13:26:07.135+00
36	20240916181643_require_estimated_exchange_rate.js	1	2024-10-22 13:26:07.138+00
37	20240916181659_add_ilp_quote_details.js	1	2024-10-22 13:26:07.143+00
38	20240916182716_drop_quote_ilp_fields.js	1	2024-10-22 13:26:07.145+00
39	20240916185330_add_quote_source_amount.js	1	2024-10-22 13:26:07.145+00
\.


--
-- Data for Name: knex_migrations_lock; Type: TABLE DATA; Schema: public; Owner: cloud_nine_wallet_backend
--

COPY public.knex_migrations_lock (index, is_locked) FROM stdin;
1	0
\.


--
-- Data for Name: ledgerAccounts; Type: TABLE DATA; Schema: public; Owner: cloud_nine_wallet_backend
--

COPY public."ledgerAccounts" (id, "accountRef", ledger, type, "createdAt", "updatedAt") FROM stdin;
6ac920b7-5ff2-4bc1-9e66-067fa09c688a	e9dc256b-de44-4c49-981e-cee051c66a8a	1	LIQUIDITY_ASSET	2024-10-22 13:26:09.261579+00	2024-10-22 13:26:09.261579+00
aea50695-6b25-4f13-ba35-2bf65e4587e7	e9dc256b-de44-4c49-981e-cee051c66a8a	1	SETTLEMENT	2024-10-22 13:26:09.261579+00	2024-10-22 13:26:09.261579+00
33c1c1f8-25b7-40a6-bc49-5a82467bfcf5	81f94b29-1a66-4931-baf4-4b5d17da35d3	2	LIQUIDITY_ASSET	2024-10-22 13:26:09.308522+00	2024-10-22 13:26:09.308522+00
1c3bae13-c3a5-4df1-90b9-e49b2bbabbc2	81f94b29-1a66-4931-baf4-4b5d17da35d3	2	SETTLEMENT	2024-10-22 13:26:09.308522+00	2024-10-22 13:26:09.308522+00
05d23a0c-4150-405e-9c91-b988389670a7	5391cf5b-bcb2-4ce3-bd20-cef0e300d43a	3	LIQUIDITY_ASSET	2024-10-22 13:26:09.34146+00	2024-10-22 13:26:09.34146+00
9f04ed86-5b1f-4ec8-be36-5dc8ae34a341	5391cf5b-bcb2-4ce3-bd20-cef0e300d43a	3	SETTLEMENT	2024-10-22 13:26:09.34146+00	2024-10-22 13:26:09.34146+00
8e5d84f8-b0a6-4c07-bcd9-0ac5a2bc4644	e2f94faf-a7b5-4550-b927-43e9ca53c7a7	4	LIQUIDITY_ASSET	2024-10-22 13:26:09.371555+00	2024-10-22 13:26:09.371555+00
effaf9c1-c41f-4690-9ec0-991c62da9e52	e2f94faf-a7b5-4550-b927-43e9ca53c7a7	4	SETTLEMENT	2024-10-22 13:26:09.371555+00	2024-10-22 13:26:09.371555+00
dc2b6468-27df-4084-b26d-fb73fc2c93b0	2f5df6a2-4859-4a43-9d68-e3f0175b176f	1	LIQUIDITY_PEER	2024-10-22 13:26:09.408041+00	2024-10-22 13:26:09.408041+00
\.


--
-- Data for Name: ledgerTransfers; Type: TABLE DATA; Schema: public; Owner: cloud_nine_wallet_backend
--

COPY public."ledgerTransfers" (id, "transferRef", "debitAccountId", "creditAccountId", amount, ledger, "expiresAt", state, type, "createdAt", "updatedAt") FROM stdin;
cdbecfbc-4d53-44a4-aa5a-43a0b09e4644	768897b3-8f63-43d9-a3a0-c91d0a4a3073	aea50695-6b25-4f13-ba35-2bf65e4587e7	6ac920b7-5ff2-4bc1-9e66-067fa09c688a	100000000	1	\N	POSTED	DEPOSIT	2024-10-22 13:26:09.286837+00	2024-10-22 13:26:09.286837+00
5d75cc29-d2d2-4e64-81d1-aa05efd78915	8bc6c95b-337f-4bab-8cb7-8d63bd4e0bfa	1c3bae13-c3a5-4df1-90b9-e49b2bbabbc2	33c1c1f8-25b7-40a6-bc49-5a82467bfcf5	100000000	2	\N	POSTED	DEPOSIT	2024-10-22 13:26:09.319981+00	2024-10-22 13:26:09.319981+00
a951d2fd-3515-4d47-a70c-0a88a0cf8047	7901c8e5-9eb2-41f8-a8b4-30d5f75a20db	9f04ed86-5b1f-4ec8-be36-5dc8ae34a341	05d23a0c-4150-405e-9c91-b988389670a7	100000000	3	\N	POSTED	DEPOSIT	2024-10-22 13:26:09.352093+00	2024-10-22 13:26:09.352093+00
291ff467-e14b-497d-9280-5a2e90acf997	25265086-79aa-4f17-875b-417ef8eb71d1	effaf9c1-c41f-4690-9ec0-991c62da9e52	8e5d84f8-b0a6-4c07-bcd9-0ac5a2bc4644	1000000	4	\N	POSTED	DEPOSIT	2024-10-22 13:26:09.386945+00	2024-10-22 13:26:09.386945+00
9dac7172-a3b2-4f34-9fba-f13d10ea1eed	47185295-4270-4842-8b8b-61908d3058dd	aea50695-6b25-4f13-ba35-2bf65e4587e7	dc2b6468-27df-4084-b26d-fb73fc2c93b0	10000000	1	\N	POSTED	DEPOSIT	2024-10-22 13:26:09.461618+00	2024-10-22 13:26:09.461618+00
\.


--
-- Data for Name: outgoingPaymentGrants; Type: TABLE DATA; Schema: public; Owner: cloud_nine_wallet_backend
--

COPY public."outgoingPaymentGrants" (id) FROM stdin;
\.


--
-- Data for Name: outgoingPayments; Type: TABLE DATA; Schema: public; Owner: cloud_nine_wallet_backend
--

COPY public."outgoingPayments" (id, state, error, "stateAttempts", client, "grantId", "walletAddressId", "peerId", "createdAt", "updatedAt", metadata) FROM stdin;
\.


--
-- Data for Name: peers; Type: TABLE DATA; Schema: public; Owner: cloud_nine_wallet_backend
--

COPY public.peers (id, "assetId", "maxPacketAmount", "staticIlpAddress", "outgoingToken", "outgoingEndpoint", name, "createdAt", "updatedAt", "liquidityThreshold") FROM stdin;
2f5df6a2-4859-4a43-9d68-e3f0175b176f	e9dc256b-de44-4c49-981e-cee051c66a8a	\N	test.happy-life-bank	test-USD	http://happy-life-bank-backend:3002	\N	2024-10-22 13:26:09.408041+00	2024-10-22 13:26:09.408041+00	1000000
\.


--
-- Data for Name: quotes; Type: TABLE DATA; Schema: public; Owner: cloud_nine_wallet_backend
--

COPY public.quotes (id, receiver, "debitAmountValue", "receiveAmountValue", "receiveAmountAssetCode", "receiveAmountAssetScale", "expiresAt", "walletAddressId", "assetId", client, "createdAt", "updatedAt", "feeId", "estimatedExchangeRate", "debitAmountMinusFees") FROM stdin;
\.


--
-- Data for Name: walletAddressAdditionalProperties; Type: TABLE DATA; Schema: public; Owner: cloud_nine_wallet_backend
--

COPY public."walletAddressAdditionalProperties" (id, "fieldKey", "fieldValue", "visibleInOpenPayments", "walletAddressId", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: walletAddressKeys; Type: TABLE DATA; Schema: public; Owner: cloud_nine_wallet_backend
--

COPY public."walletAddressKeys" (id, "walletAddressId", kid, x, revoked, "createdAt", "updatedAt") FROM stdin;
1d721490-90bc-4472-a9fe-f7e228effaf3	695461c4-68a8-4522-9c87-b87032a3b8d3	keyid-742ab7cd-1624-4d2e-af6e-e15a71638669	Tk8WHUFjv9XUxXzv2OxMjoF9alvTVB1D1dcFMT47ThQ	f	2024-10-22 13:26:09.507518+00	2024-10-22 13:26:09.507518+00
adbd7782-263f-44c3-aa4b-e59e180a1259	073ff643-ba1e-4ace-a8ea-4b203250d810	keyid-5726eefe-8737-459d-a36b-0acce152cb90	Tk8WHUFjv9XUxXzv2OxMjoF9alvTVB1D1dcFMT47ThQ	f	2024-10-22 13:26:09.508593+00	2024-10-22 13:26:09.508593+00
261287b8-2d1c-40f1-979f-0fe9424a267b	1fa11175-bb49-4410-9c3d-50d86f4debf4	keyid-a9adbe1a-df31-4766-87c9-d2cb2e636a9b	Tk8WHUFjv9XUxXzv2OxMjoF9alvTVB1D1dcFMT47ThQ	f	2024-10-22 13:26:09.509048+00	2024-10-22 13:26:09.509048+00
c151ab3b-8170-420c-ba83-e580bccb12ec	f7c69a17-0155-4091-a66e-34ba1ce019bd	keyid-63dcc665-d946-4263-ac27-d0da1eb08a83	Tk8WHUFjv9XUxXzv2OxMjoF9alvTVB1D1dcFMT47ThQ	f	2024-10-22 13:26:09.511678+00	2024-10-22 13:26:09.511678+00
b840b34a-d9d3-4902-91ad-4c6862aa3df4	126d2f16-1926-4631-aa04-a0953722b943	keyid-5a95366f-8cb4-4925-88d9-ae57dcb444bb	Tk8WHUFjv9XUxXzv2OxMjoF9alvTVB1D1dcFMT47ThQ	f	2024-10-22 13:26:09.513693+00	2024-10-22 13:26:09.513693+00
\.


--
-- Data for Name: walletAddresses; Type: TABLE DATA; Schema: public; Owner: cloud_nine_wallet_backend
--

COPY public."walletAddresses" (id, url, "assetId", "publicName", "totalEventsAmount", "processAt", "createdAt", "updatedAt", "deactivatedAt") FROM stdin;
695461c4-68a8-4522-9c87-b87032a3b8d3	https://cloud-nine-wallet-backend/accounts/gfranklin	e9dc256b-de44-4c49-981e-cee051c66a8a	Grace Franklin	0	\N	2024-10-22 13:26:09.481698+00	2024-10-22 13:26:09.481698+00	\N
1fa11175-bb49-4410-9c3d-50d86f4debf4	https://cloud-nine-wallet-backend/accounts/bhamchest	e9dc256b-de44-4c49-981e-cee051c66a8a	Bert Hamchest	0	\N	2024-10-22 13:26:09.482966+00	2024-10-22 13:26:09.482966+00	\N
073ff643-ba1e-4ace-a8ea-4b203250d810	https://cloud-nine-wallet-backend/accounts/wbdc	e9dc256b-de44-4c49-981e-cee051c66a8a	World's Best Donut Co	0	\N	2024-10-22 13:26:09.483912+00	2024-10-22 13:26:09.483912+00	\N
126d2f16-1926-4631-aa04-a0953722b943	https://cloud-nine-wallet-backend/accounts/broke	e9dc256b-de44-4c49-981e-cee051c66a8a	Broke Account	0	\N	2024-10-22 13:26:09.484996+00	2024-10-22 13:26:09.484996+00	\N
f7c69a17-0155-4091-a66e-34ba1ce019bd	https://cloud-nine-wallet-backend/accounts/lrossi	81f94b29-1a66-4931-baf4-4b5d17da35d3	Luca Rossi	0	\N	2024-10-22 13:26:09.488552+00	2024-10-22 13:26:09.488552+00	\N
\.


--
-- Data for Name: webhookEvents; Type: TABLE DATA; Schema: public; Owner: cloud_nine_wallet_backend
--

COPY public."webhookEvents" (id, type, data, attempts, "statusCode", "withdrawalAccountId", "withdrawalAssetId", "withdrawalAmount", "processAt", "createdAt", "updatedAt", "outgoingPaymentId", "incomingPaymentId", "walletAddressId", "peerId", "assetId") FROM stdin;
\.


--
-- Name: assets_ledger_seq; Type: SEQUENCE SET; Schema: public; Owner: cloud_nine_wallet_backend
--

SELECT pg_catalog.setval('public.assets_ledger_seq', 4, true);


--
-- Name: knex_migrations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: cloud_nine_wallet_backend
--

SELECT pg_catalog.setval('public.knex_migrations_id_seq', 39, true);


--
-- Name: knex_migrations_lock_index_seq; Type: SEQUENCE SET; Schema: public; Owner: cloud_nine_wallet_backend
--

SELECT pg_catalog.setval('public.knex_migrations_lock_index_seq', 1, true);


--
-- Name: assets assets_code_scale_unique; Type: CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_code_scale_unique UNIQUE (code, scale);


--
-- Name: assets assets_ledger_unique; Type: CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_ledger_unique UNIQUE (ledger);


--
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);


--
-- Name: authServers authServers_pkey; Type: CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public."authServers"
    ADD CONSTRAINT "authServers_pkey" PRIMARY KEY (id);


--
-- Name: authServers authservers_url_unique; Type: CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public."authServers"
    ADD CONSTRAINT authservers_url_unique UNIQUE (url);


--
-- Name: fees fees_pkey; Type: CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public.fees
    ADD CONSTRAINT fees_pkey PRIMARY KEY (id);


--
-- Name: grants grants_accesstoken_unique; Type: CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public.grants
    ADD CONSTRAINT grants_accesstoken_unique UNIQUE ("accessToken");


--
-- Name: grants grants_pkey; Type: CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public.grants
    ADD CONSTRAINT grants_pkey PRIMARY KEY (id);


--
-- Name: httpTokens httpTokens_pkey; Type: CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public."httpTokens"
    ADD CONSTRAINT "httpTokens_pkey" PRIMARY KEY (id);


--
-- Name: httpTokens httptokens_token_unique; Type: CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public."httpTokens"
    ADD CONSTRAINT httptokens_token_unique UNIQUE (token);


--
-- Name: ilpQuoteDetails ilpQuoteDetails_pkey; Type: CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public."ilpQuoteDetails"
    ADD CONSTRAINT "ilpQuoteDetails_pkey" PRIMARY KEY (id);


--
-- Name: ilpQuoteDetails ilpquotedetails_quoteid_unique; Type: CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public."ilpQuoteDetails"
    ADD CONSTRAINT ilpquotedetails_quoteid_unique UNIQUE ("quoteId");


--
-- Name: incomingPayments incomingPayments_pkey; Type: CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public."incomingPayments"
    ADD CONSTRAINT "incomingPayments_pkey" PRIMARY KEY (id);


--
-- Name: knex_migrations_lock knex_migrations_lock_pkey; Type: CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public.knex_migrations_lock
    ADD CONSTRAINT knex_migrations_lock_pkey PRIMARY KEY (index);


--
-- Name: knex_migrations knex_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public.knex_migrations
    ADD CONSTRAINT knex_migrations_pkey PRIMARY KEY (id);


--
-- Name: ledgerAccounts ledgerAccounts_pkey; Type: CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public."ledgerAccounts"
    ADD CONSTRAINT "ledgerAccounts_pkey" PRIMARY KEY (id);


--
-- Name: ledgerTransfers ledgerTransfers_pkey; Type: CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public."ledgerTransfers"
    ADD CONSTRAINT "ledgerTransfers_pkey" PRIMARY KEY (id);


--
-- Name: ledgerAccounts ledgeraccounts_accountref_type_unique; Type: CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public."ledgerAccounts"
    ADD CONSTRAINT ledgeraccounts_accountref_type_unique UNIQUE ("accountRef", type);


--
-- Name: ledgerTransfers ledgertransfers_transferref_unique; Type: CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public."ledgerTransfers"
    ADD CONSTRAINT ledgertransfers_transferref_unique UNIQUE ("transferRef");


--
-- Name: outgoingPaymentGrants outgoingPaymentGrants_pkey; Type: CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public."outgoingPaymentGrants"
    ADD CONSTRAINT "outgoingPaymentGrants_pkey" PRIMARY KEY (id);


--
-- Name: outgoingPayments outgoingPayments_pkey; Type: CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public."outgoingPayments"
    ADD CONSTRAINT "outgoingPayments_pkey" PRIMARY KEY (id);


--
-- Name: peers peers_assetid_staticilpaddress_unique; Type: CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public.peers
    ADD CONSTRAINT peers_assetid_staticilpaddress_unique UNIQUE ("assetId", "staticIlpAddress");


--
-- Name: peers peers_pkey; Type: CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public.peers
    ADD CONSTRAINT peers_pkey PRIMARY KEY (id);


--
-- Name: quotes quotes_pkey; Type: CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public.quotes
    ADD CONSTRAINT quotes_pkey PRIMARY KEY (id);


--
-- Name: walletAddressAdditionalProperties walletAddressAdditionalProperties_pkey; Type: CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public."walletAddressAdditionalProperties"
    ADD CONSTRAINT "walletAddressAdditionalProperties_pkey" PRIMARY KEY (id);


--
-- Name: walletAddressKeys walletAddressKeys_pkey; Type: CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public."walletAddressKeys"
    ADD CONSTRAINT "walletAddressKeys_pkey" PRIMARY KEY (id);


--
-- Name: walletAddresses walletAddresses_pkey; Type: CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public."walletAddresses"
    ADD CONSTRAINT "walletAddresses_pkey" PRIMARY KEY (id);


--
-- Name: walletAddresses walletaddresses_url_unique; Type: CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public."walletAddresses"
    ADD CONSTRAINT walletaddresses_url_unique UNIQUE (url);


--
-- Name: webhookEvents webhookEvents_pkey; Type: CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public."webhookEvents"
    ADD CONSTRAINT "webhookEvents_pkey" PRIMARY KEY (id);


--
-- Name: assets_createdat_id_index; Type: INDEX; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE INDEX assets_createdat_id_index ON public.assets USING btree ("createdAt", id);


--
-- Name: httptokens_peerid_index; Type: INDEX; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE INDEX httptokens_peerid_index ON public."httpTokens" USING btree ("peerId");


--
-- Name: httptokens_token_index; Type: INDEX; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE INDEX httptokens_token_index ON public."httpTokens" USING btree (token);


--
-- Name: incomingpayments_processat_index; Type: INDEX; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE INDEX incomingpayments_processat_index ON public."incomingPayments" USING btree ("processAt");


--
-- Name: incomingpayments_walletaddressid_createdat_id_index; Type: INDEX; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE INDEX incomingpayments_walletaddressid_createdat_id_index ON public."incomingPayments" USING btree ("walletAddressId", "createdAt", id);


--
-- Name: ledgeraccounts_accountref_index; Type: INDEX; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE INDEX ledgeraccounts_accountref_index ON public."ledgerAccounts" USING btree ("accountRef");


--
-- Name: ledgertransfers_transferref_index; Type: INDEX; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE INDEX ledgertransfers_transferref_index ON public."ledgerTransfers" USING btree ("transferRef");


--
-- Name: outgoingpayments_state_index; Type: INDEX; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE INDEX outgoingpayments_state_index ON public."outgoingPayments" USING btree (state);


--
-- Name: outgoingpayments_walletaddressid_createdat_id_index; Type: INDEX; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE INDEX outgoingpayments_walletaddressid_createdat_id_index ON public."outgoingPayments" USING btree ("walletAddressId", "createdAt", id);


--
-- Name: peers_createdat_id_index; Type: INDEX; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE INDEX peers_createdat_id_index ON public.peers USING btree ("createdAt", id);


--
-- Name: peers_staticilpaddress_index; Type: INDEX; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE INDEX peers_staticilpaddress_index ON public.peers USING btree ("staticIlpAddress");


--
-- Name: quotes_walletaddressid_createdat_id_index; Type: INDEX; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE INDEX quotes_walletaddressid_createdat_id_index ON public.quotes USING btree ("walletAddressId", "createdAt", id);


--
-- Name: walletaddressadditionalproperties_createdat_index; Type: INDEX; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE INDEX walletaddressadditionalproperties_createdat_index ON public."walletAddressAdditionalProperties" USING btree ("createdAt");


--
-- Name: walletaddressadditionalproperties_fieldkey_index; Type: INDEX; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE INDEX walletaddressadditionalproperties_fieldkey_index ON public."walletAddressAdditionalProperties" USING btree ("fieldKey");


--
-- Name: walletaddressadditionalproperties_fieldvalue_index; Type: INDEX; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE INDEX walletaddressadditionalproperties_fieldvalue_index ON public."walletAddressAdditionalProperties" USING btree ("fieldValue");


--
-- Name: walletaddressadditionalproperties_updatedat_index; Type: INDEX; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE INDEX walletaddressadditionalproperties_updatedat_index ON public."walletAddressAdditionalProperties" USING btree ("updatedAt");


--
-- Name: walletaddressadditionalproperties_visibleinopenpayments_index; Type: INDEX; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE INDEX walletaddressadditionalproperties_visibleinopenpayments_index ON public."walletAddressAdditionalProperties" USING btree ("visibleInOpenPayments");


--
-- Name: walletaddressadditionalproperties_walletaddressid_index; Type: INDEX; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE INDEX walletaddressadditionalproperties_walletaddressid_index ON public."walletAddressAdditionalProperties" USING btree ("walletAddressId");


--
-- Name: walletaddresses_processat_index; Type: INDEX; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE INDEX walletaddresses_processat_index ON public."walletAddresses" USING btree ("processAt");


--
-- Name: walletaddresses_url_index; Type: INDEX; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE INDEX walletaddresses_url_index ON public."walletAddresses" USING btree (url);


--
-- Name: webhookevents_assetid_index; Type: INDEX; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE INDEX webhookevents_assetid_index ON public."webhookEvents" USING btree ("assetId");


--
-- Name: webhookevents_incomingpaymentid_index; Type: INDEX; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE INDEX webhookevents_incomingpaymentid_index ON public."webhookEvents" USING btree ("incomingPaymentId");


--
-- Name: webhookevents_outgoingpaymentid_index; Type: INDEX; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE INDEX webhookevents_outgoingpaymentid_index ON public."webhookEvents" USING btree ("outgoingPaymentId");


--
-- Name: webhookevents_peerid_index; Type: INDEX; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE INDEX webhookevents_peerid_index ON public."webhookEvents" USING btree ("peerId");


--
-- Name: webhookevents_processat_index; Type: INDEX; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE INDEX webhookevents_processat_index ON public."webhookEvents" USING btree ("processAt");


--
-- Name: webhookevents_walletaddressid_index; Type: INDEX; Schema: public; Owner: cloud_nine_wallet_backend
--

CREATE INDEX webhookevents_walletaddressid_index ON public."webhookEvents" USING btree ("walletAddressId");


--
-- Name: fees fees_assetid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public.fees
    ADD CONSTRAINT fees_assetid_foreign FOREIGN KEY ("assetId") REFERENCES public.assets(id);


--
-- Name: grants grants_authserverid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public.grants
    ADD CONSTRAINT grants_authserverid_foreign FOREIGN KEY ("authServerId") REFERENCES public."authServers"(id);


--
-- Name: httpTokens httptokens_peerid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public."httpTokens"
    ADD CONSTRAINT httptokens_peerid_foreign FOREIGN KEY ("peerId") REFERENCES public.peers(id) ON DELETE CASCADE;


--
-- Name: ilpQuoteDetails ilpquotedetails_quoteid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public."ilpQuoteDetails"
    ADD CONSTRAINT ilpquotedetails_quoteid_foreign FOREIGN KEY ("quoteId") REFERENCES public.quotes(id);


--
-- Name: incomingPayments incomingpayments_assetid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public."incomingPayments"
    ADD CONSTRAINT incomingpayments_assetid_foreign FOREIGN KEY ("assetId") REFERENCES public.assets(id);


--
-- Name: incomingPayments incomingpayments_walletaddressid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public."incomingPayments"
    ADD CONSTRAINT incomingpayments_walletaddressid_foreign FOREIGN KEY ("walletAddressId") REFERENCES public."walletAddresses"(id);


--
-- Name: ledgerAccounts ledgeraccounts_ledger_foreign; Type: FK CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public."ledgerAccounts"
    ADD CONSTRAINT ledgeraccounts_ledger_foreign FOREIGN KEY (ledger) REFERENCES public.assets(ledger);


--
-- Name: ledgerTransfers ledgertransfers_creditaccountid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public."ledgerTransfers"
    ADD CONSTRAINT ledgertransfers_creditaccountid_foreign FOREIGN KEY ("creditAccountId") REFERENCES public."ledgerAccounts"(id);


--
-- Name: ledgerTransfers ledgertransfers_debitaccountid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public."ledgerTransfers"
    ADD CONSTRAINT ledgertransfers_debitaccountid_foreign FOREIGN KEY ("debitAccountId") REFERENCES public."ledgerAccounts"(id);


--
-- Name: ledgerTransfers ledgertransfers_ledger_foreign; Type: FK CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public."ledgerTransfers"
    ADD CONSTRAINT ledgertransfers_ledger_foreign FOREIGN KEY (ledger) REFERENCES public.assets(ledger);


--
-- Name: outgoingPayments outgoingpayments_grantid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public."outgoingPayments"
    ADD CONSTRAINT outgoingpayments_grantid_foreign FOREIGN KEY ("grantId") REFERENCES public."outgoingPaymentGrants"(id);


--
-- Name: outgoingPayments outgoingpayments_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public."outgoingPayments"
    ADD CONSTRAINT outgoingpayments_id_foreign FOREIGN KEY (id) REFERENCES public.quotes(id);


--
-- Name: outgoingPayments outgoingpayments_peerid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public."outgoingPayments"
    ADD CONSTRAINT outgoingpayments_peerid_foreign FOREIGN KEY ("peerId") REFERENCES public.peers(id);


--
-- Name: outgoingPayments outgoingpayments_walletaddressid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public."outgoingPayments"
    ADD CONSTRAINT outgoingpayments_walletaddressid_foreign FOREIGN KEY ("walletAddressId") REFERENCES public."walletAddresses"(id);


--
-- Name: peers peers_assetid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public.peers
    ADD CONSTRAINT peers_assetid_foreign FOREIGN KEY ("assetId") REFERENCES public.assets(id);


--
-- Name: quotes quotes_assetid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public.quotes
    ADD CONSTRAINT quotes_assetid_foreign FOREIGN KEY ("assetId") REFERENCES public.assets(id);


--
-- Name: quotes quotes_feeid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public.quotes
    ADD CONSTRAINT quotes_feeid_foreign FOREIGN KEY ("feeId") REFERENCES public.fees(id);


--
-- Name: quotes quotes_walletaddressid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public.quotes
    ADD CONSTRAINT quotes_walletaddressid_foreign FOREIGN KEY ("walletAddressId") REFERENCES public."walletAddresses"(id);


--
-- Name: walletAddressAdditionalProperties walletaddressadditionalproperties_walletaddressid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public."walletAddressAdditionalProperties"
    ADD CONSTRAINT walletaddressadditionalproperties_walletaddressid_foreign FOREIGN KEY ("walletAddressId") REFERENCES public."walletAddresses"(id) ON DELETE CASCADE;


--
-- Name: walletAddresses walletaddresses_assetid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public."walletAddresses"
    ADD CONSTRAINT walletaddresses_assetid_foreign FOREIGN KEY ("assetId") REFERENCES public.assets(id);


--
-- Name: walletAddressKeys walletaddresskeys_walletaddressid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public."walletAddressKeys"
    ADD CONSTRAINT walletaddresskeys_walletaddressid_foreign FOREIGN KEY ("walletAddressId") REFERENCES public."walletAddresses"(id);


--
-- Name: webhookEvents webhookevents_assetid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public."webhookEvents"
    ADD CONSTRAINT webhookevents_assetid_foreign FOREIGN KEY ("assetId") REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: webhookEvents webhookevents_incomingpaymentid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public."webhookEvents"
    ADD CONSTRAINT webhookevents_incomingpaymentid_foreign FOREIGN KEY ("incomingPaymentId") REFERENCES public."incomingPayments"(id) ON DELETE CASCADE;


--
-- Name: webhookEvents webhookevents_outgoingpaymentid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public."webhookEvents"
    ADD CONSTRAINT webhookevents_outgoingpaymentid_foreign FOREIGN KEY ("outgoingPaymentId") REFERENCES public."outgoingPayments"(id) ON DELETE CASCADE;


--
-- Name: webhookEvents webhookevents_peerid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public."webhookEvents"
    ADD CONSTRAINT webhookevents_peerid_foreign FOREIGN KEY ("peerId") REFERENCES public.peers(id) ON DELETE CASCADE;


--
-- Name: webhookEvents webhookevents_walletaddressid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public."webhookEvents"
    ADD CONSTRAINT webhookevents_walletaddressid_foreign FOREIGN KEY ("walletAddressId") REFERENCES public."walletAddresses"(id) ON DELETE CASCADE;


--
-- Name: webhookEvents webhookevents_withdrawalassetid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: cloud_nine_wallet_backend
--

ALTER TABLE ONLY public."webhookEvents"
    ADD CONSTRAINT webhookevents_withdrawalassetid_foreign FOREIGN KEY ("withdrawalAssetId") REFERENCES public.assets(id);


--
-- PostgreSQL database dump complete
--

