import { ApolloContext } from "../../app";
import { MutationResolvers, ResolversTypes } from "../generated/graphql";

export const createTenant: MutationResolvers<ApolloContext>['createTenant'] = async (
    _,
    args,
    ctx
  ): Promise<ResolversTypes['CreateTenantMutationResponse']> => {
    return undefined;
  }