type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;

type OpenApiSchema = {
  type?: string;
  format?: string;
  enum?: string[];
  example?: Json;
  properties?: Record<string, OpenApiSchema>;
  items?: OpenApiSchema;
  required?: string[];
  minimum?: number;
  maximum?: number;
};

type OpenApiParameter = {
  name?: string;
  in?: string;
  example?: Json;
  schema?: OpenApiSchema;
};

type OpenApiMedia = {
  schema?: OpenApiSchema;
  example?: Json;
  examples?: Record<string, { value: Json }>;
};

type OpenApiOperation = {
  tags?: string[];
  summary?: string;
  parameters?: OpenApiParameter[];
  requestBody?: { content?: Record<string, OpenApiMedia> };
  responses?: Record<
    string,
    { description?: string; content?: Record<string, OpenApiMedia> }
  >;
};

type OpenApiSpec = {
  paths?: Record<string, Record<string, OpenApiOperation>>;
};

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;

const PARAM_EXAMPLES: Record<string, Json> = {
  menuId: 42,
  id: 1,
  itemId: 101,
  categoryId: 5,
  branchId: 3,
  staffId: 7,
  tableId: 12,
  groupId: 2,
  governorateId: 4,
  adId: 9,
  noteId: 15,
  addressId: 8,
  voucherId: 6,
  caseId: 11,
  order_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  slug: "alsham-restaurant",
  pageName: "home",
  filename: "a1b2c3d4-e5f6-7890-abcd-ef1234567890.webp",
  email: "user@example.com",
  phoneNumber: "+201012345678",
  token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example",
  locale: "ar",
  page: 1,
  limit: 20,
  period: "30d",
  lat: 30.0444,
  lng: 31.2357,
  search: "burger",
  type: "logos",
  position: "header",
};

/** Curated realistic examples for high-traffic endpoints. */
const PATH_OVERRIDES: Record<
  string,
  Partial<
    Record<
      (typeof HTTP_METHODS)[number],
      {
        request?: Json;
        response?: Json;
      }
    >
  >
> = {
  "/health": {
    get: {
      response: {
        status: "ok",
        build: "public-app-version-v2",
        uptime: 3600.5,
        timestamp: "2026-07-05T12:00:00.000Z",
      },
    },
  },
  "/api/auth/check-availability": {
    get: {
      response: {
        isAvailable: true,
        message: "Email is available",
      },
    },
  },
  "/api/auth/signup": {
    post: {
      request: {
        email: "owner@restaurant.com",
        password: "SecurePass123",
        name: "Ahmed Hassan",
        phoneNumber: "+201012345678",
        restaurantName: "مطعم الشام",
        locale: "ar",
      },
      response: {
        message: "User registered successfully. Please verify your email.",
        userId: 128,
      },
    },
  },
  "/api/auth/login": {
    post: {
      request: {
        email: "owner@restaurant.com",
        password: "SecurePass123",
      },
      response: {
        message: "Login successful",
        user: {
          id: 128,
          email: "owner@restaurant.com",
          name: "Ahmed Hassan",
          restaurantName: "مطعم الشام",
          role: "user",
          phoneNumber: "+201012345678",
          isEmailVerified: true,
          isPhoneVerified: true,
          planType: "yearly",
        },
        accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.access.example",
        refreshToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.refresh.example",
      },
    },
  },
  "/api/auth/me": {
    get: {
      response: {
        user: {
          id: 128,
          email: "owner@restaurant.com",
          name: "Ahmed Hassan",
          role: "user",
        },
      },
    },
  },
  "/api/auth/refresh": {
    post: {
      request: {
        refreshToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.refresh.example",
      },
      response: {
        accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.new-access.example",
        refreshToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.new-refresh.example",
      },
    },
  },
  "/api/public/menu/{slug}": {
    get: {
      response: {
        menu: {
          id: 42,
          slug: "alsham-restaurant",
          nameAr: "مطعم الشام",
          nameEn: "Al Sham Restaurant",
          theme: "classic",
          currency: "EGP",
          isActive: true,
        },
        categories: [
          {
            id: 5,
            nameAr: "مشروبات",
            nameEn: "Drinks",
            items: [
              {
                id: 101,
                nameAr: "عصير برتقال",
                nameEn: "Orange Juice",
                price: 35,
              },
            ],
          },
        ],
      },
    },
  },
  "/api/public/staff-call": {
    post: {
      request: {
        menuId: 42,
        type: "delivery",
        customerName: "Mohamed",
        customerPhone: "+201012345678",
        customerAddress: "Smouha, Alexandria",
        branchId: 3,
        customerLat: 31.2156,
        customerLng: 29.9553,
        status: "pending",
      },
      response: {
        success: true,
        callId: 9001,
        status: "pending",
      },
    },
  },
  "/api/public/menu/{slug}/nearby-branch": {
    get: {
      response: {
        success: true,
        data: {
          currentSlug: "alsham-cairo",
          minImprovementKm: 0.5,
          redirect: {
            menuId: 44,
            slug: "alsham-alexandria",
            distanceKm: 2.3,
          },
        },
      },
    },
  },
  "/api/public/menu/{slug}/branches/{branchId}/delivery-quote": {
    get: {
      response: {
        success: true,
        data: {
          inRange: true,
          distanceKm: 4.2,
          deliveryFee: 45,
          maxDeliveryRadiusKm: 10,
        },
      },
    },
  },
  "/api/menus/{menuId}/branches": {
    get: {
      response: {
        branches: [
          {
            id: 3,
            phone: null,
            latitude: 30.0444,
            longitude: 31.2357,
            deliveryBasePrice: 20,
            deliveryPricePerKm: 10,
            maxDeliveryRadiusKm: 10,
            nameAr: "فرع القاهرة",
            nameEn: "Cairo Branch",
            addressAr: null,
            addressEn: null,
          },
        ],
      },
    },
    post: {
      request: {
        nameAr: "فرع القاهرة",
        nameEn: "Cairo Branch",
        latitude: 30.0444,
        longitude: 31.2357,
        deliveryBasePrice: 20,
        deliveryPricePerKm: 10,
        maxDeliveryRadiusKm: 10,
      },
      response: {
        message: "Branch created successfully",
        branchId: 3,
      },
    },
  },
  "/api/menus/{menuId}/delivery/settings": {
    get: {
      response: {
        deliveryOn: true,
        deliveryMode: "distance",
        deliveryPhone: "+201012345678",
        phoneNumber: "+201012345678",
        deliveryWhatsAppOn: true,
        governorates: [],
      },
    },
    put: {
      request: {
        deliveryOn: true,
        deliveryMode: "distance",
        deliveryWhatsAppOn: true,
        deliveryPhone: "+201012345678",
      },
      response: {
        deliveryOn: true,
        deliveryMode: "distance",
        deliveryPhone: "+201012345678",
        phoneNumber: "+201012345678",
        deliveryWhatsAppOn: true,
        governorates: [],
      },
    },
  },
  "/api/menu-groups": {
    get: {
      response: {
        groups: [
          {
            id: 2,
            userId: 128,
            name: "Cairo & Alexandria",
            inboxMenuId: 42,
            menuIds: [42, 44, 45],
          },
        ],
      },
    },
    post: {
      request: {
        name: "Cairo & Alexandria",
        menuIds: [42, 44],
      },
      response: {
        group: {
          id: 2,
          name: "Cairo & Alexandria",
          menuIds: [42, 44],
        },
      },
    },
  },
  "/api/menus": {
    get: {
      response: {
        menus: [
          {
            id: 42,
            uuid: "DD9F2C58-7C2A-4F99-A43B-E0B5D3998972",
            slug: "alsham-restaurant",
            nameAr: "مطعم الشام",
            nameEn: "Al Sham Restaurant",
            isActive: true,
          },
        ],
      },
    },
    post: {
      request: {
        nameAr: "مطعم الشام",
        nameEn: "Al Sham Restaurant",
        slug: "alsham-restaurant",
        logo: "/uploads/logos/example.webp",
        theme: "classic",
      },
      response: {
        message: "Menu created",
        menu: { id: 42, slug: "alsham-restaurant" },
      },
    },
  },
  "/api/user/profile": {
    get: {
      response: {
        user: {
          id: 128,
          email: "owner@restaurant.com",
          name: "Ahmed Hassan",
          restaurantName: "مطعم الشام",
          phoneNumber: "+201012345678",
          deliveryOn: true,
          profileImage: "/uploads/profile-images/example.webp",
          isEmailVerified: true,
          isPhoneVerified: false,
          hasFcmToken: true,
        },
      },
    },
  },
  "/api/admin/stats": {
    get: {
      response: {
        stats: {
          totalUsers: 1250,
          activeAccounts: 1180,
          paidPlans: 320,
          monthlyRevenue: 48500,
        },
      },
    },
  },
  "/api/admin/users": {
    get: {
      response: {
        users: [
          {
            id: 128,
            name: "Ahmed Hassan",
            email: "owner@restaurant.com",
            planName: "Pro",
            menusCount: 3,
          },
        ],
        pagination: { currentPage: 1, totalItems: 1250 },
      },
    },
  },
  "/api/payment/initiate": {
    post: {
      request: {
        amount: 999,
        currency: "EGP",
        description: "Pro yearly subscription",
      },
      response: {
        orderId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        paymentUrl: "https://pay.easykash.net/checkout/example",
      },
    },
  },
};

function exampleForSchema(schema?: OpenApiSchema, key?: string): Json {
  if (!schema) return {};

  if (key && PARAM_EXAMPLES[key] !== undefined) {
    return PARAM_EXAMPLES[key];
  }

  if (schema.enum?.length) return schema.enum[0];

  switch (schema.type) {
    case "string":
      if (schema.format === "email") return "user@example.com";
      if (schema.format === "uuid") return "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
      if (schema.format === "date-time") return "2026-07-05T12:00:00.000Z";
      if (schema.format === "binary") return "(binary file)";
      if (key?.toLowerCase().includes("password")) return "SecurePass123";
      if (key?.toLowerCase().includes("phone")) return "+201012345678";
      if (key?.toLowerCase().includes("slug")) return "alsham-restaurant";
      if (key?.toLowerCase().includes("name")) return "Example Name";
      if (key?.toLowerCase().includes("url") || key?.toLowerCase().includes("logo"))
        return "/uploads/example.webp";
      return "string";
    case "integer":
    case "number":
      return schema.minimum ?? 1;
    case "boolean":
      return true;
    case "array":
      return schema.items ? [exampleForSchema(schema.items)] : [];
    case "object": {
      const obj: Record<string, Json> = {};
      for (const [prop, propSchema] of Object.entries(schema.properties ?? {})) {
        obj[prop] = exampleForSchema(propSchema, prop);
      }
      return obj;
    }
    default:
      return {};
  }
}

function exampleFromSchema(schema?: OpenApiSchema): Json {
  return exampleForSchema(schema);
}

function enrichParameters(parameters?: OpenApiParameter[]): void {
  if (!parameters) return;
  for (const param of parameters) {
    if (param.example !== undefined) continue;
    const name = param.name ?? "";
    if (PARAM_EXAMPLES[name] !== undefined) {
      param.example = PARAM_EXAMPLES[name];
      continue;
    }
    if (param.schema) {
      param.example = exampleForSchema(param.schema, name);
      if (param.schema.example === undefined) {
        param.schema.example = param.example;
      }
    }
  }
}

function ensureJsonContent(
  content: Record<string, OpenApiMedia> | undefined,
): Record<string, OpenApiMedia> {
  if (!content) return { "application/json": {} };
  if (!content["application/json"] && !content["multipart/form-data"]) {
    content["application/json"] = {};
  }
  return content;
}

function enrichRequestBody(
  requestBody: OpenApiOperation["requestBody"],
  override?: Json,
): void {
  if (!requestBody) return;
  requestBody.content = ensureJsonContent(requestBody.content);

  const json = requestBody.content["application/json"];
  if (json && override) {
    json.example = override;
    return;
  }
  if (json && !json.example && !json.examples && json.schema) {
    json.example = exampleFromSchema(json.schema);
  }

  const multipart = requestBody.content["multipart/form-data"];
  if (multipart && !multipart.example && !multipart.examples) {
    multipart.example = {
      file: "(binary)",
      type: "logos",
    };
  }
}

function defaultResponseExample(
  status: string,
  method: string,
  path: string,
  operation: OpenApiOperation,
): Json {
  const tag = operation.tags?.[0] ?? "API";
  const code = Number(status);

  if (code >= 400) {
    return {
      error: "Request failed",
      errorAr: "فشل الطلب",
      errorEn: "Request failed",
    };
  }

  if (method === "delete") {
    return { message: "Deleted successfully" };
  }

  if (method === "post" && code === 201) {
    return { message: "Created successfully", id: 1 };
  }

  if (path.includes("/login")) {
    return PATH_OVERRIDES["/api/auth/login"]?.post?.response ?? {
      message: "Login successful",
      accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example",
    };
  }

  if (method === "get" && (path.endsWith("s") || path.includes("/list"))) {
    return {
      data: [{ id: 1, name: `Example ${tag} item` }],
      total: 1,
      page: 1,
      limit: 20,
    };
  }

  if (method === "get") {
    return { data: { id: 1, name: `Example ${tag} resource` } };
  }

  return { message: "Success", success: true };
}

function enrichResponses(
  responses: OpenApiOperation["responses"],
  method: string,
  path: string,
  operation: OpenApiOperation,
  override?: Json,
): void {
  if (!responses) {
    operation.responses = {
      "200": {
        description: "Success",
        content: {
          "application/json": {
            example: override ?? defaultResponseExample("200", method, path, operation),
          },
        },
      },
    };
    return;
  }

  for (const [status, response] of Object.entries(responses)) {
    if (override && status.startsWith("2")) {
      response.content = ensureJsonContent(response.content);
      const json = response.content["application/json"];
      if (json && !json.example && !json.examples) {
        json.example = override;
      }
      continue;
    }

    response.content = ensureJsonContent(response.content);
    const json = response.content["application/json"];
    if (!json) continue;

    if (!json.example && !json.examples) {
      json.example = json.schema
        ? exampleFromSchema(json.schema)
        : defaultResponseExample(status, method, path, operation);
    }
  }
}

/** Inject request/response/parameter examples into every documented operation. */
export function enrichSwaggerSpec<T extends OpenApiSpec>(spec: T): T {
  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;

      const override = PATH_OVERRIDES[path]?.[method];

      enrichParameters(operation.parameters);
      enrichRequestBody(operation.requestBody, override?.request);
      enrichResponses(
        operation.responses,
        method,
        path,
        operation,
        override?.response,
      );
    }
  }

  return spec;
}
