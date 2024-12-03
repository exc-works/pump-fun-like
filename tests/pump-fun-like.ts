import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PumpFunLike } from "../target/types/pump_fun_like";
import { expect } from "chai";
import {
  createAssociatedTokenAccountInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import { fetchDigitalAsset } from "@metaplex-foundation/mpl-token-metadata";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { publicKey } from "@metaplex-foundation/umi";
import { buy, sell } from "../clients/ts/src/math/coin_math";
import { buy_fee, sell_fee } from "../clients/ts/src/math/fee_math";
import { FEE_RATE_BASIS_POINT, MAX_COIN_SUPPLY, SELLABLE_COINS } from "../clients/ts/src/math/constants";
import { buy_exact_in, sell_exact_out } from "../clients/ts/src/math/sol_math";

const DECIMALS = 6;
const COIN_SEED = "coin";
const SOL_VAULT_SEED = "coin_sol_vault";
const METADATA_SEED = "metadata";
const TOKEN_METADATA_PROGRAM_ID = new anchor.web3.PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

describe("soc-pump-fun", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.PumpFunLike as Program<PumpFunLike>;
  const wallet = anchor.Wallet.local().payer;

  describe("#initialize_config", () => {
    it("should fail if maker_fee_rate is too large", async () => {
      const cfgAcctKeypair = anchor.web3.Keypair.generate();
      const authorityKeypair = anchor.web3.Keypair.generate();
      const feeRecipientKeypair = anchor.web3.Keypair.generate();
      const migrationKeypair = anchor.web3.Keypair.generate();
      try {
        await program.methods
          .initializeConfig({
            authority: authorityKeypair.publicKey,
            feeRecipient: feeRecipientKeypair.publicKey,
            migrationAuthority: migrationKeypair.publicKey,
            createCoinFee: new anchor.BN(1e9),
            makerFeeRate: Number(FEE_RATE_BASIS_POINT + 1n),
            takerFeeRate: Number(FEE_RATE_BASIS_POINT),
          })
          .accounts({
            config: cfgAcctKeypair.publicKey,
          })
          .signers([cfgAcctKeypair])
          .rpc();
        expect.fail("should have failed");
      } catch (e) {
        expect(e instanceof anchor.AnchorError).to.be.true;
        const anchorError = e as anchor.AnchorError;
        expect(anchorError.error.errorCode.number).to.be.eq(6001);
      }
    });

    it("should fail if taker_fee_rate is too large", async () => {
      const cfgAcctKeypair = anchor.web3.Keypair.generate();
      const authorityKeypair = anchor.web3.Keypair.generate();
      const feeRecipientKeypair = anchor.web3.Keypair.generate();
      const migrationKeypair = anchor.web3.Keypair.generate();
      try {
        await program.methods
          .initializeConfig({
            authority: authorityKeypair.publicKey,
            feeRecipient: feeRecipientKeypair.publicKey,
            migrationAuthority: migrationKeypair.publicKey,
            createCoinFee: new anchor.BN(1e9),
            makerFeeRate: Number(FEE_RATE_BASIS_POINT),
            takerFeeRate: Number(FEE_RATE_BASIS_POINT + 1n),
          })
          .accounts({
            config: cfgAcctKeypair.publicKey,
          })
          .signers([cfgAcctKeypair])
          .rpc();
        expect.fail("should have failed");
      } catch (e) {
        expect(e instanceof anchor.AnchorError).to.be.true;
        const anchorError = e as anchor.AnchorError;
        expect(anchorError.error.errorCode.number).to.be.eq(6000);
      }
    });

    it("should succeed", async () => {
      const cfgAcctKeypair = anchor.web3.Keypair.generate();
      const authorityKeypair = anchor.web3.Keypair.generate();
      const feeRecipientKeypair = anchor.web3.Keypair.generate();
      const migrationKeypair = anchor.web3.Keypair.generate();
      await program.methods
        .initializeConfig({
          authority: authorityKeypair.publicKey,
          feeRecipient: feeRecipientKeypair.publicKey,
          migrationAuthority: migrationKeypair.publicKey,
          createCoinFee: new anchor.BN(1e9),
          makerFeeRate: Number(FEE_RATE_BASIS_POINT),
          takerFeeRate: Number(FEE_RATE_BASIS_POINT >> 1n),
        })
        .accounts({
          config: cfgAcctKeypair.publicKey,
        })
        .signers([cfgAcctKeypair])
        .rpc();
      const cfg = await program.account.config.fetch(cfgAcctKeypair.publicKey);
      expect(cfg.authority.toBase58()).to.be.eq(authorityKeypair.publicKey.toBase58());
      expect(cfg.feeRecipient.toBase58()).to.be.eq(feeRecipientKeypair.publicKey.toBase58());
      expect(cfg.createCoinFee.toString()).to.be.eq(new anchor.BN(1e9).toString());
      expect(cfg.migrationAuthority.toBase58()).to.be.eq(migrationKeypair.publicKey.toBase58());
      expect(cfg.makerFeeRate).to.be.eq(Number(FEE_RATE_BASIS_POINT));
      expect(cfg.takerFeeRate).to.be.eq(Number(FEE_RATE_BASIS_POINT >> 1n));
    });
  });

  describe("#update_fee", () => {
    it("should fail if not the authority", async () => {
      const { cfgAcctKeypair } = await initializeConfig();
      try {
        await program.methods
          .updateFee({
            createCoinFee: new anchor.BN(1e9),
            takerFeeRate: Number(FEE_RATE_BASIS_POINT >> 1n),
            makerFeeRate: Number(FEE_RATE_BASIS_POINT >> 1n),
          })
          .accountsPartial({ config: cfgAcctKeypair.publicKey, authority: wallet.publicKey })
          .rpc();
        expect.fail("should have failed");
      } catch (e) {
        expect(e instanceof anchor.AnchorError).to.be.true;
        const anchorError = e as anchor.AnchorError;
        expect(anchorError.error.errorCode.number).to.be.eq(6002);
      }
    });

    it("should fail if maker_fee_rate is too large", async () => {
      const { cfgAcctKeypair, authorityKeypair } = await initializeConfig();
      try {
        await program.methods
          .updateFee({
            createCoinFee: new anchor.BN(1e9),
            takerFeeRate: Number(FEE_RATE_BASIS_POINT),
            makerFeeRate: Number(FEE_RATE_BASIS_POINT + 1n),
          })
          .accountsPartial({ config: cfgAcctKeypair.publicKey, authority: authorityKeypair.publicKey })
          .signers([wallet, authorityKeypair])
          .rpc();
        expect.fail("should have failed");
      } catch (e) {
        expect(e instanceof anchor.AnchorError).to.be.true;
        const anchorError = e as anchor.AnchorError;
        expect(anchorError.error.errorCode.number).to.be.eq(6001);
      }
    });

    it("should fail if taker_fee_rate is too large", async () => {
      const { cfgAcctKeypair, authorityKeypair } = await initializeConfig();
      try {
        await program.methods
          .updateFee({
            createCoinFee: new anchor.BN(1e9),
            takerFeeRate: Number(FEE_RATE_BASIS_POINT + 1n),
            makerFeeRate: Number(FEE_RATE_BASIS_POINT),
          })
          .accountsPartial({ config: cfgAcctKeypair.publicKey, authority: authorityKeypair.publicKey })
          .signers([wallet, authorityKeypair])
          .rpc();
        expect.fail("should have failed");
      } catch (e) {
        expect(e instanceof anchor.AnchorError).to.be.true;
        const anchorError = e as anchor.AnchorError;
        expect(anchorError.error.errorCode.number).to.be.eq(6000);
      }
    });

    it("should succeed", async () => {
      const { cfgAcctKeypair, authorityKeypair } = await initializeConfig();
      await program.methods
        .updateFee({
          createCoinFee: new anchor.BN(1e8),
          takerFeeRate: Number(FEE_RATE_BASIS_POINT),
          makerFeeRate: Number(FEE_RATE_BASIS_POINT),
        })
        .accountsPartial({ config: cfgAcctKeypair.publicKey, authority: authorityKeypair.publicKey })
        .signers([wallet, authorityKeypair])
        .rpc();
      const cfg = await program.account.config.fetch(cfgAcctKeypair.publicKey);
      expect(cfg.createCoinFee.toString()).to.be.eq(new anchor.BN(1e8).toString());
      expect(cfg.makerFeeRate).to.be.eq(Number(FEE_RATE_BASIS_POINT));
      expect(cfg.takerFeeRate).to.be.eq(Number(FEE_RATE_BASIS_POINT));
    });
  });

  describe("#create", () => {
    it("should failed if fee recipient mismatch", async () => {
      const { cfgAcctKeypair } = await initializeConfig();

      const mintKeypair = anchor.web3.Keypair.generate();
      const [metadataPda, metadataBump] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from(METADATA_SEED), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mintKeypair.publicKey.toBuffer()],
        TOKEN_METADATA_PROGRAM_ID
      );
      const args = {
        name: "Coin name",
        symbol: "CS",
        uri: "https://example.org",
      };
      const [coinPda, coinBump] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from(COIN_SEED), mintKeypair.publicKey.toBuffer()],
        program.programId
      );
      const [solVaultPda, solVaultBump] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from(SOL_VAULT_SEED), mintKeypair.publicKey.toBuffer()],
        program.programId
      );
      const coinVaultAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, coinPda, true);
      try {
        await program.methods
          .create(args)
          .accountsPartial({
            config: cfgAcctKeypair.publicKey,
            coin: coinPda,
            coinMint: mintKeypair.publicKey,
            coinVault: coinVaultAta,
            solVault: solVaultPda,
            tokenMetadata: metadataPda,
            feeRecipient: wallet.publicKey,
          })
          .signers([wallet, mintKeypair])
          .rpc();
        expect.fail("should have failed");
      } catch (e) {
        expect(e instanceof anchor.AnchorError).to.be.true;
        const anchorError = e as anchor.AnchorError;
        expect(anchorError.error.errorCode.number).to.eq(6003);
      }
    });

    it("should failed if sol vault mismatch", async () => {
      const { cfgAcctKeypair, feeRecipientKeypair } = await initializeConfig();

      const mintKeypair = anchor.web3.Keypair.generate();
      const [metadataPda, metadataBump] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from(METADATA_SEED), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mintKeypair.publicKey.toBuffer()],
        TOKEN_METADATA_PROGRAM_ID
      );
      const args = {
        name: "Coin name",
        symbol: "CS",
        uri: "https://example.org",
      };
      const [coinPda, coinBump] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from(COIN_SEED), mintKeypair.publicKey.toBuffer()],
        program.programId
      );
      const [solVaultPda, solVaultBump] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from(SOL_VAULT_SEED + "OTHER"), mintKeypair.publicKey.toBuffer()],
        program.programId
      );
      const coinVaultAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, coinPda, true);
      try {
        await program.methods
          .create(args)
          .accountsPartial({
            config: cfgAcctKeypair.publicKey,
            coin: coinPda,
            coinMint: mintKeypair.publicKey,
            coinVault: coinVaultAta,
            solVault: solVaultPda,
            tokenMetadata: metadataPda,
            feeRecipient: feeRecipientKeypair.publicKey,
          })
          .signers([wallet, mintKeypair])
          .rpc();
        expect.fail("should have failed");
      } catch (e) {
        expect(e instanceof anchor.AnchorError).to.be.true;
        const anchorError = e as anchor.AnchorError;
        expect(anchorError.error.errorCode.number).to.eq(6004);
      }
    });

    it("should failed if mint account use by another coin", async () => {
      const { cfgAcctKeypair, feeRecipientKeypair } = await initializeConfig();

      const mintKeypair = anchor.web3.Keypair.generate();
      const [metadataPda, metadataBump] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from(METADATA_SEED), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mintKeypair.publicKey.toBuffer()],
        TOKEN_METADATA_PROGRAM_ID
      );
      const args = {
        name: "Coin name",
        symbol: "CS",
        uri: "https://example.org",
      };
      const [coinPda, coinBump] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from(COIN_SEED), mintKeypair.publicKey.toBuffer()],
        program.programId
      );
      const [solVaultPda, solVaultBump] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from(SOL_VAULT_SEED), mintKeypair.publicKey.toBuffer()],
        program.programId
      );
      const coinVaultAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, coinPda, true);
      await program.methods
        .create(args)
        .accountsPartial({
          config: cfgAcctKeypair.publicKey,
          coin: coinPda,
          coinMint: mintKeypair.publicKey,
          coinVault: coinVaultAta,
          solVault: solVaultPda,
          tokenMetadata: metadataPda,
          feeRecipient: feeRecipientKeypair.publicKey,
        })
        .signers([wallet, mintKeypair])
        .rpc();
      try {
        await program.methods
          .create(args)
          .accountsPartial({
            config: cfgAcctKeypair.publicKey,
            coin: coinPda,
            coinMint: mintKeypair.publicKey,
            coinVault: coinVaultAta,
            solVault: solVaultPda,
            tokenMetadata: metadataPda,
            feeRecipient: feeRecipientKeypair.publicKey,
          })
          .signers([wallet, mintKeypair])
          .rpc();
        expect.fail("should have failed");
      } catch (e) {
        expect(e instanceof anchor.web3.SendTransactionError).to.be.true;
        const sendTxError = e as anchor.web3.SendTransactionError;
        const logs = sendTxError.logs.filter((log) => log.startsWith("Allocate:"));
        expect(logs.length).to.be.eq(1);
        expect(logs[0]).to.eq(
          `Allocate: account Address { address: ${coinPda.toBase58()}, base: None } already in use`
        );
      }
    });

    it("should succeed", async () => {
      const { cfgAcctKeypair, feeRecipientKeypair, cfg } = await initializeConfig();

      const mintKeypair = anchor.web3.Keypair.generate();
      const [metadataPda, metadataBump] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from(METADATA_SEED), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mintKeypair.publicKey.toBuffer()],
        TOKEN_METADATA_PROGRAM_ID
      );
      const args = {
        name: "Coin name",
        symbol: "CS",
        uri: "https://example.org",
      };
      const [coinPda, coinBump] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from(COIN_SEED), mintKeypair.publicKey.toBuffer()],
        program.programId
      );
      const [solVaultPda, solVaultBump] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from(SOL_VAULT_SEED), mintKeypair.publicKey.toBuffer()],
        program.programId
      );
      const coinVaultAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, coinPda, true);
      await program.methods
        .create(args)
        .accountsPartial({
          config: cfgAcctKeypair.publicKey,
          coin: coinPda,
          coinMint: mintKeypair.publicKey,
          coinVault: coinVaultAta,
          solVault: solVaultPda,
          tokenMetadata: metadataPda,
          feeRecipient: feeRecipientKeypair.publicKey,
        })
        .signers([wallet, mintKeypair])
        .rpc();

      const umi = createUmi(anchor.getProvider().connection);
      const asset = await fetchDigitalAsset(umi, publicKey(mintKeypair.publicKey.toBase58()));
      expect(asset.metadata.name).to.eq(args.name);
      expect(asset.metadata.symbol).to.eq(args.symbol);
      expect(asset.metadata.uri).to.eq(args.uri);
      expect(asset.mint.decimals).to.eq(DECIMALS);
      expect(asset.metadata.updateAuthority.toString()).to.eq(coinPda.toBase58());
      expect(asset.metadata.sellerFeeBasisPoints).to.eq(0);
      expect(asset.metadata.isMutable).to.false;

      const balance = await anchor.getProvider().connection.getBalance(feeRecipientKeypair.publicKey);
      expect(balance).to.eq(cfg.createCoinFee.toNumber());

      const coinVault = await getAccount(anchor.getProvider().connection, coinVaultAta);
      expect(coinVault.amount).to.eq(MAX_COIN_SUPPLY);

      const coin = await program.account.coin.fetch(coinPda);
      expect(coin.config.toBase58()).to.eq(cfgAcctKeypair.publicKey.toBase58());
      expect(coin.coinMint.toBase58()).to.eq(mintKeypair.publicKey.toBase58());
      expect(coin.coinVault.toBase58()).to.eq(coinVaultAta.toBase58());
      expect(coin.solVault.toBase58()).to.eq(solVaultPda.toBase58());
      expect(coin.symbol).to.eq(args.symbol);
      expect(coin.coinBump.length).to.eq(1);
      expect(coin.coinBump[0]).to.eq(coinBump);
      expect(coin.solVaultBump.length).to.eq(1);
      expect(coin.solVaultBump[0]).to.eq(solVaultBump);
      expect(coin.remainingCoinSupply.toNumber()).to.eq(Number(MAX_COIN_SUPPLY));
    });
  });

  describe("#buy", () => {
    it("should failed if fee recipient account mismatch", async () => {
      const { cfgAcctKeypair, feeRecipientKeypair } = await initializeConfig();
      const { feeRecipientKeypair: feeRecipientKeypairOther } = await initializeConfig();
      const { mintKeypair, coinPda, coinVaultAta, solVaultPda } = await createCoin(
        cfgAcctKeypair.publicKey,
        feeRecipientKeypair.publicKey
      );

      const coinRecipient = await getOrCreateAssociatedTokenAccount(
        anchor.getProvider().connection,
        wallet,
        mintKeypair.publicKey,
        wallet.publicKey
      );
      try {
        await program.methods
          .buy({
            amount: new anchor.BN(1e9),
            maxPay: new anchor.BN(1e9),
          })
          .accountsPartial({
            config: cfgAcctKeypair.publicKey,
            coin: coinPda,
            coinRecipient: coinRecipient.address,
            feeRecipient: feeRecipientKeypairOther.publicKey,
            coinVault: coinVaultAta,
            solVault: solVaultPda,
          })
          .rpc();
        expect.fail("should have failed");
      } catch (e) {
        expect(e instanceof anchor.AnchorError).to.be.true;
        const anchorError = e as anchor.AnchorError;
        expect(anchorError.error.errorCode.number).to.be.eq(6003);
      }
    });

    it("should failed if config account mismatch", async () => {
      const { cfgAcctKeypair, feeRecipientKeypair } = await initializeConfig();
      const { cfgAcctKeypair: cfgAcctKeypairOther, feeRecipientKeypair: feeRecipientKeypairOther } =
        await initializeConfig();
      const {
        mintKeypair: mintKeypairOther,
        coinPda: coinPdaOther,
        coinVaultAta: coinVaultAtaOther,
        solVaultPda: solVaultPdaOther,
      } = await createCoin(cfgAcctKeypairOther.publicKey, feeRecipientKeypairOther.publicKey);

      const coinRecipient = await getOrCreateAssociatedTokenAccount(
        anchor.getProvider().connection,
        wallet,
        mintKeypairOther.publicKey,
        wallet.publicKey
      );
      try {
        await program.methods
          .buy({
            amount: new anchor.BN(1e9),
            maxPay: new anchor.BN(1e9),
          })
          .accountsPartial({
            config: cfgAcctKeypair.publicKey,
            coin: coinPdaOther,
            coinRecipient: coinRecipient.address,
            feeRecipient: feeRecipientKeypair.publicKey,
            coinVault: coinVaultAtaOther,
            solVault: solVaultPdaOther,
          })
          .rpc();
        expect.fail("should have failed");
      } catch (e) {
        expect(e instanceof anchor.AnchorError).to.be.true;
        const anchorError = e as anchor.AnchorError;
        expect(anchorError.error.errorCode.number).to.be.eq(6006);
      }
    });

    it("should failed if coin vault account mismatch", async () => {
      const { cfgAcctKeypair, feeRecipientKeypair } = await initializeConfig();
      const { cfgAcctKeypair: cfgAcctKeypairOther, feeRecipientKeypair: feeRecipientKeypairOther } =
        await initializeConfig();
      const { mintKeypair, coinPda, coinVaultAta, solVaultPda } = await createCoin(
        cfgAcctKeypair.publicKey,
        feeRecipientKeypair.publicKey
      );
      const { coinVaultAta: coinVaultAtaOther } = await createCoin(
        cfgAcctKeypairOther.publicKey,
        feeRecipientKeypairOther.publicKey
      );

      const coinRecipient = await getOrCreateAssociatedTokenAccount(
        anchor.getProvider().connection,
        wallet,
        mintKeypair.publicKey,
        wallet.publicKey
      );
      try {
        await program.methods
          .buy({
            amount: new anchor.BN(1e9),
            maxPay: new anchor.BN(1e9),
          })
          .accountsPartial({
            config: cfgAcctKeypair.publicKey,
            coin: coinPda,
            coinRecipient: coinRecipient.address,
            feeRecipient: feeRecipientKeypair.publicKey,
            coinVault: coinVaultAtaOther,
            solVault: solVaultPda,
          })
          .rpc();
        expect.fail("should have failed");
      } catch (e) {
        expect(e instanceof anchor.AnchorError).to.be.true;
        const anchorError = e as anchor.AnchorError;
        expect(anchorError.error.errorCode.number).to.be.eq(6007);
      }
    });

    it("should failed if sol vault account mismatch", async () => {
      const { cfgAcctKeypair, feeRecipientKeypair } = await initializeConfig();
      const { cfgAcctKeypair: cfgAcctKeypairOther, feeRecipientKeypair: feeRecipientKeypairOther } =
        await initializeConfig();
      const { mintKeypair, coinPda, coinVaultAta, solVaultPda } = await createCoin(
        cfgAcctKeypair.publicKey,
        feeRecipientKeypair.publicKey
      );
      const { solVaultPda: solVaultPdaOther } = await createCoin(
        cfgAcctKeypairOther.publicKey,
        feeRecipientKeypairOther.publicKey
      );

      const coinRecipient = await getOrCreateAssociatedTokenAccount(
        anchor.getProvider().connection,
        wallet,
        mintKeypair.publicKey,
        wallet.publicKey
      );
      try {
        await program.methods
          .buy({
            amount: new anchor.BN(1e9),
            maxPay: new anchor.BN(1e9),
          })
          .accountsPartial({
            config: cfgAcctKeypair.publicKey,
            coin: coinPda,
            coinRecipient: coinRecipient.address,
            feeRecipient: feeRecipientKeypair.publicKey,
            coinVault: coinVaultAta,
            solVault: solVaultPdaOther,
          })
          .rpc();
        expect.fail("should have failed");
      } catch (e) {
        expect(e instanceof anchor.AnchorError).to.be.true;
        const anchorError = e as anchor.AnchorError;
        expect(anchorError.error.errorCode.number).to.be.eq(6004);
      }
    });

    it("should failed if coin mint account mismatch", async () => {
      const { cfgAcctKeypair, feeRecipientKeypair } = await initializeConfig();
      const { cfgAcctKeypair: cfgAcctKeypairOther, feeRecipientKeypair: feeRecipientKeypairOther } =
        await initializeConfig();
      const { mintKeypair, coinPda, coinVaultAta, solVaultPda } = await createCoin(
        cfgAcctKeypair.publicKey,
        feeRecipientKeypair.publicKey
      );
      const { mintKeypair: mintKeypairOther } = await createCoin(
        cfgAcctKeypairOther.publicKey,
        feeRecipientKeypairOther.publicKey
      );

      const coinRecipient = await getOrCreateAssociatedTokenAccount(
        anchor.getProvider().connection,
        wallet,
        mintKeypairOther.publicKey,
        wallet.publicKey
      );
      try {
        await program.methods
          .buy({
            amount: new anchor.BN(1e9),
            maxPay: new anchor.BN(1e9),
          })
          .accountsPartial({
            config: cfgAcctKeypair.publicKey,
            coin: coinPda,
            coinRecipient: coinRecipient.address,
            feeRecipient: feeRecipientKeypair.publicKey,
            coinVault: coinVaultAta,
            solVault: solVaultPda,
          })
          .rpc();
        expect.fail("should have failed");
      } catch (e) {
        expect(e instanceof anchor.AnchorError).to.be.true;
        const anchorError = e as anchor.AnchorError;
        expect(anchorError.error.errorCode.number).to.be.eq(6008);
      }
    });

    it("should failed if pay amount exceeds max pay", async () => {
      const { cfgAcctKeypair, feeRecipientKeypair, cfg } = await initializeConfig();
      const { mintKeypair, coinPda, coinVaultAta, solVaultPda } = await createCoin(
        cfgAcctKeypair.publicKey,
        feeRecipientKeypair.publicKey
      );

      const payer = anchor.web3.Keypair.generate();
      const payerBalanceBefore = 1e9 * 100;
      const tx = await anchor.getProvider().connection.requestAirdrop(payer.publicKey, payerBalanceBefore);
      await confirmTransaction(tx);

      const coinRecipientAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, payer.publicKey);
      const createAtaIX = createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        coinRecipientAta,
        payer.publicKey,
        mintKeypair.publicKey
      );
      const buyAmount = BigInt(1e8) * BigInt(1e6);
      const payWithoutFee = buy(MAX_COIN_SUPPLY, buyAmount);
      const fee = buy_fee(payWithoutFee, BigInt(cfg.makerFeeRate));
      const buyIX = await program.methods
        .buy({
          amount: new anchor.BN(buyAmount.toString()),
          maxPay: new anchor.BN((payWithoutFee + fee - 1n).toString()),
        })
        .accountsPartial({
          config: cfgAcctKeypair.publicKey,
          coin: coinPda,
          coinRecipient: coinRecipientAta,
          feeRecipient: feeRecipientKeypair.publicKey,
          coinVault: coinVaultAta,
          solVault: solVaultPda,
          payer: payer.publicKey,
        })
        .instruction();

      const transaction = new anchor.web3.Transaction();
      transaction.add(createAtaIX, buyIX);
      try {
        await sendAndConfirmTransaction(transaction, wallet, payer);
        expect.fail("should have failed");
      } catch (e) {
        expect(e instanceof anchor.web3.SendTransactionError).to.be.true;
        const sendTxError = e as anchor.web3.SendTransactionError;
        expect(sendTxError.message.includes(BigInt(6010).toString(16))).to.be.true;
      }
    });

    it("should failed if payer balance insufficient", async () => {
      const { cfgAcctKeypair, feeRecipientKeypair, cfg } = await initializeConfig();
      const { mintKeypair, coinPda, coinVaultAta, solVaultPda } = await createCoin(
        cfgAcctKeypair.publicKey,
        feeRecipientKeypair.publicKey
      );

      const payer = anchor.web3.Keypair.generate();
      const payerBalanceBefore = 1e9;
      const tx = await anchor.getProvider().connection.requestAirdrop(payer.publicKey, payerBalanceBefore);
      await confirmTransaction(tx);

      const coinRecipientAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, payer.publicKey);
      const createAtaIX = createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        coinRecipientAta,
        payer.publicKey,
        mintKeypair.publicKey
      );
      const buyAmount = BigInt(1e8) * BigInt(1e6);
      const payWithoutFee = buy(MAX_COIN_SUPPLY, buyAmount);
      const fee = buy_fee(payWithoutFee, BigInt(cfg.makerFeeRate));
      const buyIX = await program.methods
        .buy({
          amount: new anchor.BN(buyAmount.toString()),
          maxPay: new anchor.BN((payWithoutFee + fee).toString()),
        })
        .accountsPartial({
          config: cfgAcctKeypair.publicKey,
          coin: coinPda,
          coinRecipient: coinRecipientAta,
          feeRecipient: feeRecipientKeypair.publicKey,
          coinVault: coinVaultAta,
          solVault: solVaultPda,
          payer: payer.publicKey,
        })
        .instruction();

      const transaction = new anchor.web3.Transaction();
      transaction.add(createAtaIX, buyIX);
      try {
        await sendAndConfirmTransaction(transaction, wallet, payer);
        expect.fail("should have failed");
      } catch (e) {
        expect(e instanceof anchor.web3.SendTransactionError);
        const sendTxError = e as anchor.web3.SendTransactionError;
        expect(sendTxError.logs.join(" ").includes("insufficient lamports")).to.be.true;
      }
    });

    it("should failed if sellable coins insufficient", async () => {
      const { cfgAcctKeypair, feeRecipientKeypair, cfg } = await initializeConfig();
      const { mintKeypair, coinPda, coinVaultAta, solVaultPda } = await createCoin(
        cfgAcctKeypair.publicKey,
        feeRecipientKeypair.publicKey
      );

      const payer = anchor.web3.Keypair.generate();
      const payerBalanceBefore = 1e9 * 100;
      const tx = await anchor.getProvider().connection.requestAirdrop(payer.publicKey, payerBalanceBefore);
      await confirmTransaction(tx);

      const coinRecipientAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, payer.publicKey);
      const createAtaIX = createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        coinRecipientAta,
        payer.publicKey,
        mintKeypair.publicKey
      );
      const buyIX = await program.methods
        .buy({
          amount: new anchor.BN((SELLABLE_COINS + 1n).toString()),
          maxPay: new anchor.BN(1),
        })
        .accountsPartial({
          config: cfgAcctKeypair.publicKey,
          coin: coinPda,
          coinRecipient: coinRecipientAta,
          feeRecipient: feeRecipientKeypair.publicKey,
          coinVault: coinVaultAta,
          solVault: solVaultPda,
          payer: payer.publicKey,
        })
        .instruction();

      const transaction = new anchor.web3.Transaction();
      transaction.add(createAtaIX, buyIX);
      try {
        await sendAndConfirmTransaction(transaction, wallet, payer);
        expect.fail("should have failed");
      } catch (e) {
        expect(e instanceof anchor.web3.SendTransactionError).to.be.true;
        const sendTxError = e as anchor.web3.SendTransactionError;
        expect(sendTxError.message.includes(BigInt(6009).toString(16))).to.be.true;
      }
    });

    it("should failed if migration limit exceeded", async () => {
      const { cfgAcctKeypair, feeRecipientKeypair, cfg } = await initializeConfig();
      const { mintKeypair, coinPda, coinVaultAta, solVaultPda } = await createCoin(
        cfgAcctKeypair.publicKey,
        feeRecipientKeypair.publicKey
      );

      const payer = anchor.web3.Keypair.generate();
      const payerBalanceBefore = 1e9 * 100;
      const tx = await anchor.getProvider().connection.requestAirdrop(payer.publicKey, payerBalanceBefore);
      await confirmTransaction(tx);

      const coinRecipientAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, payer.publicKey);
      const createAtaIX = createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        coinRecipientAta,
        payer.publicKey,
        mintKeypair.publicKey
      );
      const buyAmount = SELLABLE_COINS;
      const payWithoutFee = buy(MAX_COIN_SUPPLY, buyAmount);
      const fee = buy_fee(payWithoutFee, BigInt(cfg.makerFeeRate));
      const buyIX = await program.methods
        .buy({
          amount: new anchor.BN(buyAmount.toString()),
          maxPay: new anchor.BN((payWithoutFee + fee).toString()),
        })
        .accountsPartial({
          config: cfgAcctKeypair.publicKey,
          coin: coinPda,
          coinRecipient: coinRecipientAta,
          feeRecipient: feeRecipientKeypair.publicKey,
          coinVault: coinVaultAta,
          solVault: solVaultPda,
          payer: payer.publicKey,
        })
        .instruction();

      const transaction = new anchor.web3.Transaction();
      transaction.add(createAtaIX, buyIX);
      await sendAndConfirmTransaction(transaction, wallet, payer);

      {
        const transaction = new anchor.web3.Transaction();
        transaction.add(buyIX);
        try {
          await sendAndConfirmTransaction(transaction, wallet, payer);
          expect.fail("should have failed");
        } catch (e) {
          expect(e instanceof anchor.web3.SendTransactionError).to.be.true;
          const sendTxError = e as anchor.web3.SendTransactionError;
          expect(sendTxError.message.includes(BigInt(6012).toString(16))).to.be.true;
        }
      }
    });

    it("should succeed", async () => {
      const { cfgAcctKeypair, feeRecipientKeypair, cfg } = await initializeConfig();
      const { mintKeypair, coinPda, coinVaultAta, solVaultPda } = await createCoin(
        cfgAcctKeypair.publicKey,
        feeRecipientKeypair.publicKey
      );

      const payer = anchor.web3.Keypair.generate();
      const payerBalanceBefore = 1e9 * 100;
      const tx = await anchor.getProvider().connection.requestAirdrop(payer.publicKey, payerBalanceBefore);
      await confirmTransaction(tx);

      const solVaultBalanceBefore = await anchor.getProvider().connection.getBalance(solVaultPda);
      const feeRecipientBalanceBefore = await anchor.getProvider().connection.getBalance(feeRecipientKeypair.publicKey);

      const coinRecipientAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, payer.publicKey);
      const createAtaIX = createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        coinRecipientAta,
        payer.publicKey,
        mintKeypair.publicKey
      );
      const buyAmount = BigInt(1e8) * BigInt(1e6);
      const payWithoutFee = buy(MAX_COIN_SUPPLY, buyAmount);
      const fee = buy_fee(payWithoutFee, BigInt(cfg.makerFeeRate));
      const buyIX = await program.methods
        .buy({
          amount: new anchor.BN(buyAmount.toString()),
          maxPay: new anchor.BN((payWithoutFee + fee).toString()),
        })
        .accountsPartial({
          config: cfgAcctKeypair.publicKey,
          coin: coinPda,
          coinRecipient: coinRecipientAta,
          feeRecipient: feeRecipientKeypair.publicKey,
          coinVault: coinVaultAta,
          solVault: solVaultPda,
          payer: payer.publicKey,
        })
        .instruction();

      const transaction = new anchor.web3.Transaction();
      transaction.add(createAtaIX, buyIX);
      await sendAndConfirmTransaction(transaction, wallet, payer);

      const solVaultBalanceAfter = await anchor.getProvider().connection.getBalance(solVaultPda);
      const feeRecipientBalanceAfter = await anchor.getProvider().connection.getBalance(feeRecipientKeypair.publicKey);
      expect(feeRecipientBalanceAfter - feeRecipientBalanceBefore).to.eq(Number(fee));
      expect(solVaultBalanceAfter - solVaultBalanceBefore).to.eq(Number(payWithoutFee));
      const payerBalanceAfter = await anchor.getProvider().connection.getBalance(payer.publicKey);
      expect(payerBalanceBefore - payerBalanceAfter).to.eq(Number(payWithoutFee + fee));

      const coinRecipientBalanceAfter = await getAccount(anchor.getProvider().connection, coinRecipientAta);
      expect(coinRecipientBalanceAfter.amount).to.eq(buyAmount);

      const coinVaultBalanceAfter = await getAccount(anchor.getProvider().connection, coinVaultAta);
      expect(coinVaultBalanceAfter.amount + buyAmount).to.eq(MAX_COIN_SUPPLY);

      const { remainingCoinSupply, accumulateSol } = await program.account.coin.fetch(coinPda);
      expect(remainingCoinSupply.toNumber() + Number(buyAmount)).to.eq(Number(MAX_COIN_SUPPLY));
      expect(accumulateSol.toNumber()).to.eq(Number(payWithoutFee));
    });
  });

  describe("#buy_exact_in", () => {
    it("should failed if fee recipient account mismatch", async () => {
      const { cfgAcctKeypair, feeRecipientKeypair } = await initializeConfig();
      const { feeRecipientKeypair: feeRecipientKeypairOther } = await initializeConfig();
      const { mintKeypair, coinPda, coinVaultAta, solVaultPda } = await createCoin(
        cfgAcctKeypair.publicKey,
        feeRecipientKeypair.publicKey
      );

      const coinRecipient = await getOrCreateAssociatedTokenAccount(
        anchor.getProvider().connection,
        wallet,
        mintKeypair.publicKey,
        wallet.publicKey
      );
      try {
        await program.methods
          .buyExactIn({
            payAmount: new anchor.BN(1e9),
            minReceive: new anchor.BN(1e9),
          })
          .accountsPartial({
            config: cfgAcctKeypair.publicKey,
            coin: coinPda,
            coinRecipient: coinRecipient.address,
            feeRecipient: feeRecipientKeypairOther.publicKey,
            coinVault: coinVaultAta,
            solVault: solVaultPda,
          })
          .rpc();
        expect.fail("should have failed");
      } catch (e) {
        expect(e instanceof anchor.AnchorError).to.be.true;
        const anchorError = e as anchor.AnchorError;
        expect(anchorError.error.errorCode.number).to.be.eq(6003);
      }
    });

    it("should failed if config account mismatch", async () => {
      const { cfgAcctKeypair, feeRecipientKeypair } = await initializeConfig();
      const { cfgAcctKeypair: cfgAcctKeypairOther, feeRecipientKeypair: feeRecipientKeypairOther } =
        await initializeConfig();
      const {
        mintKeypair: mintKeypairOther,
        coinPda: coinPdaOther,
        coinVaultAta: coinVaultAtaOther,
        solVaultPda: solVaultPdaOther,
      } = await createCoin(cfgAcctKeypairOther.publicKey, feeRecipientKeypairOther.publicKey);

      const coinRecipient = await getOrCreateAssociatedTokenAccount(
        anchor.getProvider().connection,
        wallet,
        mintKeypairOther.publicKey,
        wallet.publicKey
      );
      try {
        await program.methods
          .buyExactIn({
            payAmount: new anchor.BN(1e9),
            minReceive: new anchor.BN(1e9),
          })
          .accountsPartial({
            config: cfgAcctKeypair.publicKey,
            coin: coinPdaOther,
            coinRecipient: coinRecipient.address,
            feeRecipient: feeRecipientKeypair.publicKey,
            coinVault: coinVaultAtaOther,
            solVault: solVaultPdaOther,
          })
          .rpc();
        expect.fail("should have failed");
      } catch (e) {
        expect(e instanceof anchor.AnchorError).to.be.true;
        const anchorError = e as anchor.AnchorError;
        expect(anchorError.error.errorCode.number).to.be.eq(6006);
      }
    });

    it("should failed if coin vault account mismatch", async () => {
      const { cfgAcctKeypair, feeRecipientKeypair } = await initializeConfig();
      const { cfgAcctKeypair: cfgAcctKeypairOther, feeRecipientKeypair: feeRecipientKeypairOther } =
        await initializeConfig();
      const { mintKeypair, coinPda, coinVaultAta, solVaultPda } = await createCoin(
        cfgAcctKeypair.publicKey,
        feeRecipientKeypair.publicKey
      );
      const { coinVaultAta: coinVaultAtaOther } = await createCoin(
        cfgAcctKeypairOther.publicKey,
        feeRecipientKeypairOther.publicKey
      );

      const coinRecipient = await getOrCreateAssociatedTokenAccount(
        anchor.getProvider().connection,
        wallet,
        mintKeypair.publicKey,
        wallet.publicKey
      );
      try {
        await program.methods
          .buyExactIn({
            payAmount: new anchor.BN(1e9),
            minReceive: new anchor.BN(1e9),
          })
          .accountsPartial({
            config: cfgAcctKeypair.publicKey,
            coin: coinPda,
            coinRecipient: coinRecipient.address,
            feeRecipient: feeRecipientKeypair.publicKey,
            coinVault: coinVaultAtaOther,
            solVault: solVaultPda,
          })
          .rpc();
        expect.fail("should have failed");
      } catch (e) {
        expect(e instanceof anchor.AnchorError).to.be.true;
        const anchorError = e as anchor.AnchorError;
        expect(anchorError.error.errorCode.number).to.be.eq(6007);
      }
    });

    it("should failed if sol vault account mismatch", async () => {
      const { cfgAcctKeypair, feeRecipientKeypair } = await initializeConfig();
      const { cfgAcctKeypair: cfgAcctKeypairOther, feeRecipientKeypair: feeRecipientKeypairOther } =
        await initializeConfig();
      const { mintKeypair, coinPda, coinVaultAta, solVaultPda } = await createCoin(
        cfgAcctKeypair.publicKey,
        feeRecipientKeypair.publicKey
      );
      const { solVaultPda: solVaultPdaOther } = await createCoin(
        cfgAcctKeypairOther.publicKey,
        feeRecipientKeypairOther.publicKey
      );

      const coinRecipient = await getOrCreateAssociatedTokenAccount(
        anchor.getProvider().connection,
        wallet,
        mintKeypair.publicKey,
        wallet.publicKey
      );
      try {
        await program.methods
          .buyExactIn({
            payAmount: new anchor.BN(1e9),
            minReceive: new anchor.BN(1e9),
          })
          .accountsPartial({
            config: cfgAcctKeypair.publicKey,
            coin: coinPda,
            coinRecipient: coinRecipient.address,
            feeRecipient: feeRecipientKeypair.publicKey,
            coinVault: coinVaultAta,
            solVault: solVaultPdaOther,
          })
          .rpc();
        expect.fail("should have failed");
      } catch (e) {
        expect(e instanceof anchor.AnchorError).to.be.true;
        const anchorError = e as anchor.AnchorError;
        expect(anchorError.error.errorCode.number).to.be.eq(6004);
      }
    });

    it("should failed if coin mint account mismatch", async () => {
      const { cfgAcctKeypair, feeRecipientKeypair } = await initializeConfig();
      const { cfgAcctKeypair: cfgAcctKeypairOther, feeRecipientKeypair: feeRecipientKeypairOther } =
        await initializeConfig();
      const { mintKeypair, coinPda, coinVaultAta, solVaultPda } = await createCoin(
        cfgAcctKeypair.publicKey,
        feeRecipientKeypair.publicKey
      );
      const { mintKeypair: mintKeypairOther } = await createCoin(
        cfgAcctKeypairOther.publicKey,
        feeRecipientKeypairOther.publicKey
      );

      const coinRecipient = await getOrCreateAssociatedTokenAccount(
        anchor.getProvider().connection,
        wallet,
        mintKeypairOther.publicKey,
        wallet.publicKey
      );
      try {
        await program.methods
          .buyExactIn({
            payAmount: new anchor.BN(1e9),
            minReceive: new anchor.BN(1e9),
          })
          .accountsPartial({
            config: cfgAcctKeypair.publicKey,
            coin: coinPda,
            coinRecipient: coinRecipient.address,
            feeRecipient: feeRecipientKeypair.publicKey,
            coinVault: coinVaultAta,
            solVault: solVaultPda,
          })
          .rpc();
        expect.fail("should have failed");
      } catch (e) {
        expect(e instanceof anchor.AnchorError).to.be.true;
        const anchorError = e as anchor.AnchorError;
        expect(anchorError.error.errorCode.number).to.be.eq(6008);
      }
    });

    it("should failed if min receive not match", async () => {
      const { cfgAcctKeypair, feeRecipientKeypair, cfg } = await initializeConfig();
      const { mintKeypair, coinPda, coinVaultAta, solVaultPda } = await createCoin(
        cfgAcctKeypair.publicKey,
        feeRecipientKeypair.publicKey
      );

      const payer = anchor.web3.Keypair.generate();
      const payerBalanceBefore = 1e9 * 100;
      const tx = await anchor.getProvider().connection.requestAirdrop(payer.publicKey, payerBalanceBefore);
      await confirmTransaction(tx);

      const coinRecipientAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, payer.publicKey);
      const createAtaIX = createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        coinRecipientAta,
        payer.publicKey,
        mintKeypair.publicKey
      );
      const payAmountWithoutFee = 10n * BigInt(1e9);
      const buyAmount = buy_exact_in(MAX_COIN_SUPPLY, payAmountWithoutFee);
      const buyIX = await program.methods
        .buyExactIn({
          payAmount: new anchor.BN(payAmountWithoutFee.toString()),
          minReceive: new anchor.BN((buyAmount + 1n).toString()),
        })
        .accountsPartial({
          config: cfgAcctKeypair.publicKey,
          coin: coinPda,
          coinRecipient: coinRecipientAta,
          feeRecipient: feeRecipientKeypair.publicKey,
          coinVault: coinVaultAta,
          solVault: solVaultPda,
          payer: payer.publicKey,
        })
        .instruction();

      const transaction = new anchor.web3.Transaction();
      transaction.add(createAtaIX, buyIX);
      try {
        await sendAndConfirmTransaction(transaction, wallet, payer);
        expect.fail("should have failed");
      } catch (e) {
        expect(e instanceof anchor.web3.SendTransactionError).to.be.true;
        const sendTxError = e as anchor.web3.SendTransactionError;
        expect(sendTxError.message.includes(BigInt(6011).toString(16))).to.be.true;
      }
    });

    it("should failed if payer balance insufficient", async () => {
      const { cfgAcctKeypair, feeRecipientKeypair, cfg } = await initializeConfig();
      const { mintKeypair, coinPda, coinVaultAta, solVaultPda } = await createCoin(
        cfgAcctKeypair.publicKey,
        feeRecipientKeypair.publicKey
      );

      const payer = anchor.web3.Keypair.generate();
      const payerBalanceBefore = 1e9;
      const tx = await anchor.getProvider().connection.requestAirdrop(payer.publicKey, payerBalanceBefore);
      await confirmTransaction(tx);

      const coinRecipientAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, payer.publicKey);
      const createAtaIX = createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        coinRecipientAta,
        payer.publicKey,
        mintKeypair.publicKey
      );
      const payAmountWithoutFee = BigInt(1e9);
      const buyAmount = buy_exact_in(MAX_COIN_SUPPLY, payAmountWithoutFee);
      const buyIX = await program.methods
        .buyExactIn({
          payAmount: new anchor.BN(payAmountWithoutFee.toString()),
          minReceive: new anchor.BN(buyAmount.toString()),
        })
        .accountsPartial({
          config: cfgAcctKeypair.publicKey,
          coin: coinPda,
          coinRecipient: coinRecipientAta,
          feeRecipient: feeRecipientKeypair.publicKey,
          coinVault: coinVaultAta,
          solVault: solVaultPda,
          payer: payer.publicKey,
        })
        .instruction();

      const transaction = new anchor.web3.Transaction();
      transaction.add(createAtaIX, buyIX);
      try {
        await sendAndConfirmTransaction(transaction, wallet, payer);
        expect.fail("should have failed");
      } catch (e) {
        expect(e instanceof anchor.web3.SendTransactionError);
        const sendTxError = e as anchor.web3.SendTransactionError;
        expect(sendTxError.logs.join(" ").includes("insufficient lamports")).to.be.true;
      }
    });

    it("should not failed if pay too more (sellable coins insufficient)", async () => {
      const { cfgAcctKeypair, feeRecipientKeypair, cfg } = await initializeConfig();
      const { mintKeypair, coinPda, coinVaultAta, solVaultPda } = await createCoin(
        cfgAcctKeypair.publicKey,
        feeRecipientKeypair.publicKey
      );

      const payer = anchor.web3.Keypair.generate();
      const payerBalanceBefore = 1e9 * 100;
      const tx = await anchor.getProvider().connection.requestAirdrop(payer.publicKey, payerBalanceBefore);
      await confirmTransaction(tx);

      const solVaultBalanceBefore = await anchor.getProvider().connection.getBalance(solVaultPda);
      const feeRecipientBalanceBefore = await anchor.getProvider().connection.getBalance(feeRecipientKeypair.publicKey);

      const coinRecipientAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, payer.publicKey);
      const createAtaIX = createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        coinRecipientAta,
        payer.publicKey,
        mintKeypair.publicKey
      );
      const pay = buy(MAX_COIN_SUPPLY, SELLABLE_COINS);
      const actualPay = pay + BigInt(1e9);
      const buyAmount = buy_exact_in(MAX_COIN_SUPPLY, actualPay);
      const fee = buy_fee(actualPay, BigInt(cfg.makerFeeRate));
      const buyIX = await program.methods
        .buyExactIn({
          payAmount: new anchor.BN(actualPay.toString()),
          minReceive: new anchor.BN(buyAmount.toString()),
        })
        .accountsPartial({
          config: cfgAcctKeypair.publicKey,
          coin: coinPda,
          coinRecipient: coinRecipientAta,
          feeRecipient: feeRecipientKeypair.publicKey,
          coinVault: coinVaultAta,
          solVault: solVaultPda,
          payer: payer.publicKey,
        })
        .instruction();

      const transaction = new anchor.web3.Transaction();
      transaction.add(createAtaIX, buyIX);
      await sendAndConfirmTransaction(transaction, wallet, payer);

      const solVaultBalanceAfter = await anchor.getProvider().connection.getBalance(solVaultPda);
      const feeRecipientBalanceAfter = await anchor.getProvider().connection.getBalance(feeRecipientKeypair.publicKey);
      expect(feeRecipientBalanceAfter - feeRecipientBalanceBefore).to.eq(Number(fee));
      expect(solVaultBalanceAfter - solVaultBalanceBefore).to.eq(Number(actualPay));
      const payerBalanceAfter = await anchor.getProvider().connection.getBalance(payer.publicKey);
      expect(payerBalanceBefore - payerBalanceAfter).to.eq(Number(actualPay + fee));

      const coinRecipientBalanceAfter = await getAccount(anchor.getProvider().connection, coinRecipientAta);
      expect(coinRecipientBalanceAfter.amount).to.eq(buyAmount);

      const coinVaultBalanceAfter = await getAccount(anchor.getProvider().connection, coinVaultAta);
      expect(coinVaultBalanceAfter.amount + buyAmount).to.eq(MAX_COIN_SUPPLY);

      const { remainingCoinSupply, accumulateSol } = await program.account.coin.fetch(coinPda);
      expect(remainingCoinSupply.toNumber() + Number(buyAmount)).to.eq(Number(MAX_COIN_SUPPLY));
      expect(accumulateSol.toNumber()).to.eq(Number(actualPay));
    });

    it("should failed if migration limit exceeded", async () => {
      const { cfgAcctKeypair, feeRecipientKeypair, cfg } = await initializeConfig();
      const { mintKeypair, coinPda, coinVaultAta, solVaultPda } = await createCoin(
        cfgAcctKeypair.publicKey,
        feeRecipientKeypair.publicKey
      );

      const payer = anchor.web3.Keypair.generate();
      const payerBalanceBefore = 1e9 * 100;
      const tx = await anchor.getProvider().connection.requestAirdrop(payer.publicKey, payerBalanceBefore);
      await confirmTransaction(tx);

      const coinRecipientAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, payer.publicKey);
      const createAtaIX = createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        coinRecipientAta,
        payer.publicKey,
        mintKeypair.publicKey
      );
      const buyAmount = SELLABLE_COINS;
      const pay = buy(MAX_COIN_SUPPLY, buyAmount);
      const actualPay = pay + BigInt(1e9);
      const buyIX = await program.methods
        .buyExactIn({
          payAmount: new anchor.BN(actualPay.toString()),
          minReceive: new anchor.BN(buyAmount.toString()),
        })
        .accountsPartial({
          config: cfgAcctKeypair.publicKey,
          coin: coinPda,
          coinRecipient: coinRecipientAta,
          feeRecipient: feeRecipientKeypair.publicKey,
          coinVault: coinVaultAta,
          solVault: solVaultPda,
          payer: payer.publicKey,
        })
        .instruction();

      const transaction = new anchor.web3.Transaction();
      transaction.add(createAtaIX, buyIX);
      await sendAndConfirmTransaction(transaction, wallet, payer);

      {
        const transaction = new anchor.web3.Transaction();
        transaction.add(buyIX);
        try {
          await sendAndConfirmTransaction(transaction, wallet, payer);
          expect.fail("should have failed");
        } catch (e) {
          expect(e instanceof anchor.web3.SendTransactionError).to.be.true;
          const sendTxError = e as anchor.web3.SendTransactionError;
          expect(sendTxError.message.includes(BigInt(6012).toString(16))).to.be.true;
        }
      }
    });

    it("should succeed", async () => {
      const { cfgAcctKeypair, feeRecipientKeypair, cfg } = await initializeConfig();
      const { mintKeypair, coinPda, coinVaultAta, solVaultPda } = await createCoin(
        cfgAcctKeypair.publicKey,
        feeRecipientKeypair.publicKey
      );

      const payer = anchor.web3.Keypair.generate();
      const payerBalanceBefore = 1e9 * 100;
      const tx = await anchor.getProvider().connection.requestAirdrop(payer.publicKey, payerBalanceBefore);
      await confirmTransaction(tx);

      const solVaultBalanceBefore = await anchor.getProvider().connection.getBalance(solVaultPda);
      const feeRecipientBalanceBefore = await anchor.getProvider().connection.getBalance(feeRecipientKeypair.publicKey);

      const coinRecipientAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, payer.publicKey);
      const createAtaIX = createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        coinRecipientAta,
        payer.publicKey,
        mintKeypair.publicKey
      );
      const payWithoutFee = 10n * BigInt(1e9);
      const buyAmount = buy_exact_in(MAX_COIN_SUPPLY, payWithoutFee);
      const fee = buy_fee(payWithoutFee, BigInt(cfg.makerFeeRate));
      const buyIX = await program.methods
        .buyExactIn({
          payAmount: new anchor.BN(payWithoutFee.toString()),
          minReceive: new anchor.BN(buyAmount.toString()),
        })
        .accountsPartial({
          config: cfgAcctKeypair.publicKey,
          coin: coinPda,
          coinRecipient: coinRecipientAta,
          feeRecipient: feeRecipientKeypair.publicKey,
          coinVault: coinVaultAta,
          solVault: solVaultPda,
          payer: payer.publicKey,
        })
        .instruction();

      const transaction = new anchor.web3.Transaction();
      transaction.add(createAtaIX, buyIX);
      await sendAndConfirmTransaction(transaction, wallet, payer);

      const solVaultBalanceAfter = await anchor.getProvider().connection.getBalance(solVaultPda);
      const feeRecipientBalanceAfter = await anchor.getProvider().connection.getBalance(feeRecipientKeypair.publicKey);
      expect(feeRecipientBalanceAfter - feeRecipientBalanceBefore).to.eq(Number(fee));
      expect(solVaultBalanceAfter - solVaultBalanceBefore).to.eq(Number(payWithoutFee));
      const payerBalanceAfter = await anchor.getProvider().connection.getBalance(payer.publicKey);
      expect(payerBalanceBefore - payerBalanceAfter).to.eq(Number(payWithoutFee + fee));

      const coinRecipientBalanceAfter = await getAccount(anchor.getProvider().connection, coinRecipientAta);
      expect(coinRecipientBalanceAfter.amount).to.eq(buyAmount);

      const coinVaultBalanceAfter = await getAccount(anchor.getProvider().connection, coinVaultAta);
      expect(coinVaultBalanceAfter.amount + buyAmount).to.eq(MAX_COIN_SUPPLY);

      const { remainingCoinSupply, accumulateSol } = await program.account.coin.fetch(coinPda);
      expect(remainingCoinSupply.toNumber() + Number(buyAmount)).to.eq(Number(MAX_COIN_SUPPLY));
      expect(accumulateSol.toNumber()).to.eq(Number(payWithoutFee));
    });
  });

  describe("#sell", () => {
    it("should failed if fee recipient account mismatch", async () => {
      const { cfgAcctKeypair, feeRecipientKeypair } = await initializeConfig();
      const { feeRecipientKeypair: feeRecipientKeypairOther } = await initializeConfig();
      const { mintKeypair, coinPda, coinVaultAta, solVaultPda } = await createCoin(
        cfgAcctKeypair.publicKey,
        feeRecipientKeypair.publicKey
      );

      const coinRecipient = await getOrCreateAssociatedTokenAccount(
        anchor.getProvider().connection,
        wallet,
        mintKeypair.publicKey,
        wallet.publicKey
      );
      try {
        await program.methods
          .sell({
            amount: new anchor.BN(1e9),
            minReceive: new anchor.BN(1e9),
          })
          .accountsPartial({
            config: cfgAcctKeypair.publicKey,
            coin: coinPda,
            feeRecipient: feeRecipientKeypairOther.publicKey,
            coinVault: coinVaultAta,
            solVault: solVaultPda,
            solRecipient: wallet.publicKey,
            coinPayer: coinRecipient.address,
          })
          .rpc();
        expect.fail("should have failed");
      } catch (e) {
        expect(e instanceof anchor.AnchorError).to.be.true;
        const anchorError = e as anchor.AnchorError;
        expect(anchorError.error.errorCode.number).to.be.eq(6003);
      }
    });

    it("should failed if config account mismatch", async () => {
      const { cfgAcctKeypair, feeRecipientKeypair } = await initializeConfig();
      const { cfgAcctKeypair: cfgAcctKeypairOther, feeRecipientKeypair: feeRecipientKeypairOther } =
        await initializeConfig();
      const {
        mintKeypair: mintKeypairOther,
        coinPda: coinPdaOther,
        coinVaultAta: coinVaultAtaOther,
        solVaultPda: solVaultPdaOther,
      } = await createCoin(cfgAcctKeypairOther.publicKey, feeRecipientKeypairOther.publicKey);

      const coinRecipient = await getOrCreateAssociatedTokenAccount(
        anchor.getProvider().connection,
        wallet,
        mintKeypairOther.publicKey,
        wallet.publicKey
      );
      try {
        await program.methods
          .sell({
            amount: new anchor.BN(1e9),
            minReceive: new anchor.BN(1e9),
          })
          .accountsPartial({
            config: cfgAcctKeypair.publicKey,
            coin: coinPdaOther,
            feeRecipient: feeRecipientKeypair.publicKey,
            coinVault: coinVaultAtaOther,
            solVault: solVaultPdaOther,
            solRecipient: wallet.publicKey,
            coinPayer: coinRecipient.address,
          })
          .rpc();
        expect.fail("should have failed");
      } catch (e) {
        expect(e instanceof anchor.AnchorError).to.be.true;
        const anchorError = e as anchor.AnchorError;
        expect(anchorError.error.errorCode.number).to.be.eq(6006);
      }
    });

    it("should failed if coin vault account mismatch", async () => {
      const { cfgAcctKeypair, feeRecipientKeypair } = await initializeConfig();
      const { cfgAcctKeypair: cfgAcctKeypairOther, feeRecipientKeypair: feeRecipientKeypairOther } =
        await initializeConfig();
      const { mintKeypair, coinPda, coinVaultAta, solVaultPda } = await createCoin(
        cfgAcctKeypair.publicKey,
        feeRecipientKeypair.publicKey
      );
      const { coinVaultAta: coinVaultAtaOther } = await createCoin(
        cfgAcctKeypairOther.publicKey,
        feeRecipientKeypairOther.publicKey
      );

      const coinRecipient = await getOrCreateAssociatedTokenAccount(
        anchor.getProvider().connection,
        wallet,
        mintKeypair.publicKey,
        wallet.publicKey
      );
      try {
        await program.methods
          .sell({
            amount: new anchor.BN(1e9),
            minReceive: new anchor.BN(1e9),
          })
          .accountsPartial({
            config: cfgAcctKeypair.publicKey,
            coin: coinPda,
            feeRecipient: feeRecipientKeypair.publicKey,
            coinVault: coinVaultAtaOther,
            solVault: solVaultPda,
            solRecipient: wallet.publicKey,
            coinPayer: coinRecipient.address,
          })
          .rpc();
        expect.fail("should have failed");
      } catch (e) {
        expect(e instanceof anchor.AnchorError).to.be.true;
        const anchorError = e as anchor.AnchorError;
        expect(anchorError.error.errorCode.number).to.be.eq(6007);
      }
    });

    it("should failed if sol vault account mismatch", async () => {
      const { cfgAcctKeypair, feeRecipientKeypair } = await initializeConfig();
      const { cfgAcctKeypair: cfgAcctKeypairOther, feeRecipientKeypair: feeRecipientKeypairOther } =
        await initializeConfig();
      const { mintKeypair, coinPda, coinVaultAta, solVaultPda } = await createCoin(
        cfgAcctKeypair.publicKey,
        feeRecipientKeypair.publicKey
      );
      const { solVaultPda: solVaultPdaOther } = await createCoin(
        cfgAcctKeypairOther.publicKey,
        feeRecipientKeypairOther.publicKey
      );

      const coinRecipient = await getOrCreateAssociatedTokenAccount(
        anchor.getProvider().connection,
        wallet,
        mintKeypair.publicKey,
        wallet.publicKey
      );
      try {
        await program.methods
          .sell({
            amount: new anchor.BN(1e9),
            minReceive: new anchor.BN(1e9),
          })
          .accountsPartial({
            config: cfgAcctKeypair.publicKey,
            coin: coinPda,
            feeRecipient: feeRecipientKeypair.publicKey,
            coinVault: coinVaultAta,
            solVault: solVaultPdaOther,
            solRecipient: wallet.publicKey,
            coinPayer: coinRecipient.address,
          })
          .rpc();
        expect.fail("should have failed");
      } catch (e) {
        expect(e instanceof anchor.AnchorError).to.be.true;
        const anchorError = e as anchor.AnchorError;
        expect(anchorError.error.errorCode.number).to.be.eq(6004);
      }
    });

    it("should failed if coin mint account mismatch", async () => {
      const { cfgAcctKeypair, feeRecipientKeypair } = await initializeConfig();
      const { cfgAcctKeypair: cfgAcctKeypairOther, feeRecipientKeypair: feeRecipientKeypairOther } =
        await initializeConfig();
      const { mintKeypair, coinPda, coinVaultAta, solVaultPda } = await createCoin(
        cfgAcctKeypair.publicKey,
        feeRecipientKeypair.publicKey
      );
      const { mintKeypair: mintKeypairOther } = await createCoin(
        cfgAcctKeypairOther.publicKey,
        feeRecipientKeypairOther.publicKey
      );

      const coinRecipient = await getOrCreateAssociatedTokenAccount(
        anchor.getProvider().connection,
        wallet,
        mintKeypairOther.publicKey,
        wallet.publicKey
      );
      try {
        await program.methods
          .sell({
            amount: new anchor.BN(1e9),
            minReceive: new anchor.BN(1e9),
          })
          .accountsPartial({
            config: cfgAcctKeypair.publicKey,
            coin: coinPda,
            feeRecipient: feeRecipientKeypair.publicKey,
            coinVault: coinVaultAta,
            solVault: solVaultPda,
            solRecipient: wallet.publicKey,
            coinPayer: coinRecipient.address,
          })
          .rpc();
        expect.fail("should have failed");
      } catch (e) {
        expect(e instanceof anchor.AnchorError).to.be.true;
        const anchorError = e as anchor.AnchorError;
        expect(anchorError.logs.join(" ")).to.includes(
          "Program log: AnchorError occurred. Error Code: ConstraintTokenMint. Error Number: 2014. Error Message: A token mint constraint was violated."
        );
      }
    });

    it("should failed if min receive not match", async () => {
      const { cfgAcctKeypair, feeRecipientKeypair, cfg } = await initializeConfig();
      const { mintKeypair, coinPda, coinVaultAta, solVaultPda } = await createCoin(
        cfgAcctKeypair.publicKey,
        feeRecipientKeypair.publicKey
      );

      const payer = anchor.web3.Keypair.generate();
      const payerBalanceBefore = 1e9 * 100;
      const tx = await anchor.getProvider().connection.requestAirdrop(payer.publicKey, payerBalanceBefore);
      await confirmTransaction(tx);

      const coinRecipientAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, payer.publicKey);
      const createAtaIX = createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        coinRecipientAta,
        payer.publicKey,
        mintKeypair.publicKey
      );
      const buyAmount = BigInt(1e8) * BigInt(1e6);
      const payWithoutFee = buy(MAX_COIN_SUPPLY, buyAmount);
      const fee = buy_fee(payWithoutFee, BigInt(cfg.makerFeeRate));
      const buyIX = await program.methods
        .buy({
          amount: new anchor.BN(buyAmount.toString()),
          maxPay: new anchor.BN((payWithoutFee + fee).toString()),
        })
        .accountsPartial({
          config: cfgAcctKeypair.publicKey,
          coin: coinPda,
          coinRecipient: coinRecipientAta,
          feeRecipient: feeRecipientKeypair.publicKey,
          coinVault: coinVaultAta,
          solVault: solVaultPda,
          payer: payer.publicKey,
        })
        .instruction();
      const receiveWithFee = sell(MAX_COIN_SUPPLY - buyAmount, buyAmount);
      const sellFee = sell_fee(receiveWithFee, BigInt(cfg.takerFeeRate));
      const sellIX = await program.methods
        .sell({
          amount: new anchor.BN(buyAmount.toString()),
          minReceive: new anchor.BN((receiveWithFee - sellFee + 1n).toString()),
        })
        .accountsPartial({
          config: cfgAcctKeypair.publicKey,
          coin: coinPda,
          feeRecipient: feeRecipientKeypair.publicKey,
          coinVault: coinVaultAta,
          solVault: solVaultPda,
          solRecipient: wallet.publicKey,
          payer: payer.publicKey,
          coinPayer: coinRecipientAta,
        })
        .instruction();

      const transaction = new anchor.web3.Transaction();
      transaction.add(createAtaIX, buyIX, sellIX);
      try {
        await sendAndConfirmTransaction(transaction, wallet, payer);
        expect.fail("should have failed");
      } catch (e) {
        expect(e instanceof anchor.web3.SendTransactionError).to.be.true;
        const sendTxError = e as anchor.web3.SendTransactionError;
        expect(sendTxError.message.includes(BigInt(6011).toString(16))).to.be.true;
      }
    });

    it("should failed if payer balance insufficient", async () => {
      const { cfgAcctKeypair, feeRecipientKeypair, cfg } = await initializeConfig();
      const { mintKeypair, coinPda, coinVaultAta, solVaultPda } = await createCoin(
        cfgAcctKeypair.publicKey,
        feeRecipientKeypair.publicKey
      );

      const payer = anchor.web3.Keypair.generate();
      const payerBalanceBefore = 1e9 * 100;
      const tx = await anchor.getProvider().connection.requestAirdrop(payer.publicKey, payerBalanceBefore);
      await confirmTransaction(tx);

      const coinRecipientAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, payer.publicKey);
      const createAtaIX = createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        coinRecipientAta,
        payer.publicKey,
        mintKeypair.publicKey
      );
      const buyAmount = BigInt(1e8) * BigInt(1e6);
      const payWithoutFee = buy(MAX_COIN_SUPPLY, buyAmount);
      const fee = buy_fee(payWithoutFee, BigInt(cfg.makerFeeRate));
      const buyIX = await program.methods
        .buy({
          amount: new anchor.BN(buyAmount.toString()),
          maxPay: new anchor.BN((payWithoutFee + fee).toString()),
        })
        .accountsPartial({
          config: cfgAcctKeypair.publicKey,
          coin: coinPda,
          coinRecipient: coinRecipientAta,
          feeRecipient: feeRecipientKeypair.publicKey,
          coinVault: coinVaultAta,
          solVault: solVaultPda,
          payer: payer.publicKey,
        })
        .instruction();

      const coinRecipientAtaOther = getAssociatedTokenAddressSync(mintKeypair.publicKey, wallet.publicKey);
      const createAtaOtherIX = createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        coinRecipientAtaOther,
        wallet.publicKey,
        mintKeypair.publicKey
      );
      const sellIX = await program.methods
        .sell({
          amount: new anchor.BN(1),
          minReceive: new anchor.BN(0),
        })
        .accountsPartial({
          config: cfgAcctKeypair.publicKey,
          coin: coinPda,
          feeRecipient: feeRecipientKeypair.publicKey,
          coinVault: coinVaultAta,
          solVault: solVaultPda,
          solRecipient: wallet.publicKey,
          payer: wallet.publicKey,
          coinPayer: coinRecipientAtaOther,
        })
        .instruction();

      const transaction = new anchor.web3.Transaction();
      transaction.add(createAtaIX, buyIX, createAtaOtherIX, sellIX);
      try {
        await sendAndConfirmTransaction(transaction, wallet, payer);
        expect.fail("should have failed");
      } catch (e) {
        expect(e instanceof anchor.web3.SendTransactionError);
        const sendTxError = e as anchor.web3.SendTransactionError;
        expect(sendTxError.logs.join(" ").includes("Program log: Error: insufficient funds")).to.be.true;
      }
    });

    it("should failed if migration limit exceeded", async () => {
      const { cfgAcctKeypair, feeRecipientKeypair, cfg } = await initializeConfig();
      const { mintKeypair, coinPda, coinVaultAta, solVaultPda } = await createCoin(
        cfgAcctKeypair.publicKey,
        feeRecipientKeypair.publicKey
      );

      const payer = anchor.web3.Keypair.generate();
      const payerBalanceBefore = 1e9 * 100;
      const tx = await anchor.getProvider().connection.requestAirdrop(payer.publicKey, payerBalanceBefore);
      await confirmTransaction(tx);

      const coinRecipientAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, payer.publicKey);
      const createAtaIX = createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        coinRecipientAta,
        payer.publicKey,
        mintKeypair.publicKey
      );
      const payWithoutFee = buy(MAX_COIN_SUPPLY, SELLABLE_COINS);
      const fee = buy_fee(payWithoutFee, BigInt(cfg.makerFeeRate));
      const buyIX = await program.methods
        .buy({
          amount: new anchor.BN(SELLABLE_COINS.toString()),
          maxPay: new anchor.BN((payWithoutFee + fee).toString()),
        })
        .accountsPartial({
          config: cfgAcctKeypair.publicKey,
          coin: coinPda,
          coinRecipient: coinRecipientAta,
          feeRecipient: feeRecipientKeypair.publicKey,
          coinVault: coinVaultAta,
          solVault: solVaultPda,
          payer: payer.publicKey,
        })
        .instruction();
      const sellIX = await program.methods
        .sell({
          amount: new anchor.BN(1),
          minReceive: new anchor.BN(0),
        })
        .accountsPartial({
          config: cfgAcctKeypair.publicKey,
          coin: coinPda,
          feeRecipient: feeRecipientKeypair.publicKey,
          coinVault: coinVaultAta,
          solVault: solVaultPda,
          solRecipient: wallet.publicKey,
          payer: payer.publicKey,
          coinPayer: coinRecipientAta,
        })
        .instruction();

      const transaction = new anchor.web3.Transaction();
      transaction.add(createAtaIX, buyIX, sellIX);
      try {
        await sendAndConfirmTransaction(transaction, wallet, payer);
        expect.fail("should have failed");
      } catch (e) {
        expect(e instanceof anchor.web3.SendTransactionError).to.be.true;
        const sendTxError = e as anchor.web3.SendTransactionError;
        expect(sendTxError.message.includes(BigInt(6012).toString(16))).to.be.true;
      }
    });

    it("should succeed", async () => {
      const { cfgAcctKeypair, feeRecipientKeypair, cfg } = await initializeConfig();
      const { mintKeypair, coinPda, coinVaultAta, solVaultPda } = await createCoin(
        cfgAcctKeypair.publicKey,
        feeRecipientKeypair.publicKey
      );

      const payer = anchor.web3.Keypair.generate();
      const payerBalanceBefore = 1e9 * 100;
      const tx = await anchor.getProvider().connection.requestAirdrop(payer.publicKey, payerBalanceBefore);
      await confirmTransaction(tx);

      const solVaultBalanceBefore = await anchor.getProvider().connection.getBalance(solVaultPda);
      const feeRecipientBalanceBefore = await anchor.getProvider().connection.getBalance(feeRecipientKeypair.publicKey);

      const coinRecipientAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, payer.publicKey);
      const createAtaIX = createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        coinRecipientAta,
        payer.publicKey,
        mintKeypair.publicKey
      );
      const buyAmount = BigInt(1e8) * BigInt(1e6);
      const payWithoutFee = buy(MAX_COIN_SUPPLY, buyAmount);
      const fee = buy_fee(payWithoutFee, BigInt(cfg.makerFeeRate));
      const buyIX = await program.methods
        .buy({
          amount: new anchor.BN(buyAmount.toString()),
          maxPay: new anchor.BN((payWithoutFee + fee).toString()),
        })
        .accountsPartial({
          config: cfgAcctKeypair.publicKey,
          coin: coinPda,
          coinRecipient: coinRecipientAta,
          feeRecipient: feeRecipientKeypair.publicKey,
          coinVault: coinVaultAta,
          solVault: solVaultPda,
          payer: payer.publicKey,
        })
        .instruction();
      const receiveWithFee = sell(MAX_COIN_SUPPLY - buyAmount, buyAmount >> 1n);
      const sellFee = sell_fee(receiveWithFee, BigInt(cfg.takerFeeRate));
      const sellIX = await program.methods
        .sell({
          amount: new anchor.BN((buyAmount >> 1n).toString()),
          minReceive: new anchor.BN((receiveWithFee - sellFee).toString()),
        })
        .accountsPartial({
          config: cfgAcctKeypair.publicKey,
          coin: coinPda,
          feeRecipient: feeRecipientKeypair.publicKey,
          coinVault: coinVaultAta,
          solVault: solVaultPda,
          solRecipient: payer.publicKey,
          payer: payer.publicKey,
          coinPayer: coinRecipientAta,
        })
        .instruction();

      const transaction = new anchor.web3.Transaction();
      transaction.add(createAtaIX, buyIX, sellIX);
      await sendAndConfirmTransaction(transaction, wallet, payer);

      const solVaultBalanceAfter = await anchor.getProvider().connection.getBalance(solVaultPda);
      const feeRecipientBalanceAfter = await anchor.getProvider().connection.getBalance(feeRecipientKeypair.publicKey);
      expect(feeRecipientBalanceAfter - feeRecipientBalanceBefore).to.eq(Number(fee + sellFee));
      expect(solVaultBalanceAfter - solVaultBalanceBefore).to.eq(Number(payWithoutFee - receiveWithFee));
      const payerBalanceAfter = await anchor.getProvider().connection.getBalance(payer.publicKey);
      expect(payerBalanceBefore - payerBalanceAfter).to.eq(Number(payWithoutFee + fee - (receiveWithFee - sellFee)));

      const coinRecipientBalanceAfter = await getAccount(anchor.getProvider().connection, coinRecipientAta);
      expect(coinRecipientBalanceAfter.amount).to.eq(buyAmount >> 1n);

      const coinVaultBalanceAfter = await getAccount(anchor.getProvider().connection, coinVaultAta);
      expect(coinVaultBalanceAfter.amount + (buyAmount >> 1n)).to.eq(MAX_COIN_SUPPLY);

      const { remainingCoinSupply, accumulateSol } = await program.account.coin.fetch(coinPda);
      expect(remainingCoinSupply.toNumber() + Number(buyAmount >> 1n)).to.eq(Number(MAX_COIN_SUPPLY));
      expect(accumulateSol.toNumber()).to.eq(Number(payWithoutFee - receiveWithFee));
    });
  });

  describe("#sell_exact_out", () => {
    it("should failed if fee recipient account mismatch", async () => {
      const { cfgAcctKeypair, feeRecipientKeypair } = await initializeConfig();
      const { feeRecipientKeypair: feeRecipientKeypairOther } = await initializeConfig();
      const { mintKeypair, coinPda, coinVaultAta, solVaultPda } = await createCoin(
        cfgAcctKeypair.publicKey,
        feeRecipientKeypair.publicKey
      );

      const coinRecipient = await getOrCreateAssociatedTokenAccount(
        anchor.getProvider().connection,
        wallet,
        mintKeypair.publicKey,
        wallet.publicKey
      );
      try {
        await program.methods
          .sellExactOut({
            receive: new anchor.BN(1e9),
            maxPay: new anchor.BN(1e9),
          })
          .accountsPartial({
            config: cfgAcctKeypair.publicKey,
            coin: coinPda,
            feeRecipient: feeRecipientKeypairOther.publicKey,
            coinVault: coinVaultAta,
            solVault: solVaultPda,
            solRecipient: wallet.publicKey,
            coinPayer: coinRecipient.address,
          })
          .rpc();
        expect.fail("should have failed");
      } catch (e) {
        expect(e instanceof anchor.AnchorError).to.be.true;
        const anchorError = e as anchor.AnchorError;
        expect(anchorError.error.errorCode.number).to.be.eq(6003);
      }
    });

    it("should failed if config account mismatch", async () => {
      const { cfgAcctKeypair, feeRecipientKeypair } = await initializeConfig();
      const { cfgAcctKeypair: cfgAcctKeypairOther, feeRecipientKeypair: feeRecipientKeypairOther } =
        await initializeConfig();
      const {
        mintKeypair: mintKeypairOther,
        coinPda: coinPdaOther,
        coinVaultAta: coinVaultAtaOther,
        solVaultPda: solVaultPdaOther,
      } = await createCoin(cfgAcctKeypairOther.publicKey, feeRecipientKeypairOther.publicKey);

      const coinRecipient = await getOrCreateAssociatedTokenAccount(
        anchor.getProvider().connection,
        wallet,
        mintKeypairOther.publicKey,
        wallet.publicKey
      );
      try {
        await program.methods
          .sellExactOut({
            receive: new anchor.BN(1e9),
            maxPay: new anchor.BN(1e9),
          })
          .accountsPartial({
            config: cfgAcctKeypair.publicKey,
            coin: coinPdaOther,
            feeRecipient: feeRecipientKeypair.publicKey,
            coinVault: coinVaultAtaOther,
            solVault: solVaultPdaOther,
            solRecipient: wallet.publicKey,
            coinPayer: coinRecipient.address,
          })
          .rpc();
        expect.fail("should have failed");
      } catch (e) {
        expect(e instanceof anchor.AnchorError).to.be.true;
        const anchorError = e as anchor.AnchorError;
        expect(anchorError.error.errorCode.number).to.be.eq(6006);
      }
    });

    it("should failed if coin vault account mismatch", async () => {
      const { cfgAcctKeypair, feeRecipientKeypair } = await initializeConfig();
      const { cfgAcctKeypair: cfgAcctKeypairOther, feeRecipientKeypair: feeRecipientKeypairOther } =
        await initializeConfig();
      const { mintKeypair, coinPda, coinVaultAta, solVaultPda } = await createCoin(
        cfgAcctKeypair.publicKey,
        feeRecipientKeypair.publicKey
      );
      const { coinVaultAta: coinVaultAtaOther } = await createCoin(
        cfgAcctKeypairOther.publicKey,
        feeRecipientKeypairOther.publicKey
      );

      const coinRecipient = await getOrCreateAssociatedTokenAccount(
        anchor.getProvider().connection,
        wallet,
        mintKeypair.publicKey,
        wallet.publicKey
      );
      try {
        await program.methods
          .sellExactOut({
            receive: new anchor.BN(1e9),
            maxPay: new anchor.BN(1e9),
          })
          .accountsPartial({
            config: cfgAcctKeypair.publicKey,
            coin: coinPda,
            feeRecipient: feeRecipientKeypair.publicKey,
            coinVault: coinVaultAtaOther,
            solVault: solVaultPda,
            solRecipient: wallet.publicKey,
            coinPayer: coinRecipient.address,
          })
          .rpc();
        expect.fail("should have failed");
      } catch (e) {
        expect(e instanceof anchor.AnchorError).to.be.true;
        const anchorError = e as anchor.AnchorError;
        expect(anchorError.error.errorCode.number).to.be.eq(6007);
      }
    });

    it("should failed if sol vault account mismatch", async () => {
      const { cfgAcctKeypair, feeRecipientKeypair } = await initializeConfig();
      const { cfgAcctKeypair: cfgAcctKeypairOther, feeRecipientKeypair: feeRecipientKeypairOther } =
        await initializeConfig();
      const { mintKeypair, coinPda, coinVaultAta, solVaultPda } = await createCoin(
        cfgAcctKeypair.publicKey,
        feeRecipientKeypair.publicKey
      );
      const { solVaultPda: solVaultPdaOther } = await createCoin(
        cfgAcctKeypairOther.publicKey,
        feeRecipientKeypairOther.publicKey
      );

      const coinRecipient = await getOrCreateAssociatedTokenAccount(
        anchor.getProvider().connection,
        wallet,
        mintKeypair.publicKey,
        wallet.publicKey
      );
      try {
        await program.methods
          .sellExactOut({
            receive: new anchor.BN(1e9),
            maxPay: new anchor.BN(1e9),
          })
          .accountsPartial({
            config: cfgAcctKeypair.publicKey,
            coin: coinPda,
            feeRecipient: feeRecipientKeypair.publicKey,
            coinVault: coinVaultAta,
            solVault: solVaultPdaOther,
            solRecipient: wallet.publicKey,
            coinPayer: coinRecipient.address,
          })
          .rpc();
        expect.fail("should have failed");
      } catch (e) {
        expect(e instanceof anchor.AnchorError).to.be.true;
        const anchorError = e as anchor.AnchorError;
        expect(anchorError.error.errorCode.number).to.be.eq(6004);
      }
    });

    it("should failed if coin mint account mismatch", async () => {
      const { cfgAcctKeypair, feeRecipientKeypair } = await initializeConfig();
      const { cfgAcctKeypair: cfgAcctKeypairOther, feeRecipientKeypair: feeRecipientKeypairOther } =
        await initializeConfig();
      const { mintKeypair, coinPda, coinVaultAta, solVaultPda } = await createCoin(
        cfgAcctKeypair.publicKey,
        feeRecipientKeypair.publicKey
      );
      const { mintKeypair: mintKeypairOther } = await createCoin(
        cfgAcctKeypairOther.publicKey,
        feeRecipientKeypairOther.publicKey
      );

      const coinRecipient = await getOrCreateAssociatedTokenAccount(
        anchor.getProvider().connection,
        wallet,
        mintKeypairOther.publicKey,
        wallet.publicKey
      );
      try {
        await program.methods
          .sellExactOut({
            receive: new anchor.BN(1e9),
            maxPay: new anchor.BN(1e9),
          })
          .accountsPartial({
            config: cfgAcctKeypair.publicKey,
            coin: coinPda,
            feeRecipient: feeRecipientKeypair.publicKey,
            coinVault: coinVaultAta,
            solVault: solVaultPda,
            solRecipient: wallet.publicKey,
            coinPayer: coinRecipient.address,
          })
          .rpc();
        expect.fail("should have failed");
      } catch (e) {
        expect(e instanceof anchor.AnchorError).to.be.true;
        const anchorError = e as anchor.AnchorError;
        expect(anchorError.logs.join(" ")).to.includes(
          "Program log: AnchorError occurred. Error Code: ConstraintTokenMint. Error Number: 2014. Error Message: A token mint constraint was violated."
        );
      }
    });

    it("should failed if max pay exceed", async () => {
      const { cfgAcctKeypair, feeRecipientKeypair, cfg } = await initializeConfig();
      const { mintKeypair, coinPda, coinVaultAta, solVaultPda } = await createCoin(
        cfgAcctKeypair.publicKey,
        feeRecipientKeypair.publicKey
      );

      const payer = anchor.web3.Keypair.generate();
      const payerBalanceBefore = 1e9 * 100;
      const tx = await anchor.getProvider().connection.requestAirdrop(payer.publicKey, payerBalanceBefore);
      await confirmTransaction(tx);

      const coinRecipientAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, payer.publicKey);
      const createAtaIX = createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        coinRecipientAta,
        payer.publicKey,
        mintKeypair.publicKey
      );
      const buyAmount = BigInt(1e8) * BigInt(1e6);
      const payWithoutFee = buy(MAX_COIN_SUPPLY, buyAmount);
      const fee = buy_fee(payWithoutFee, BigInt(cfg.makerFeeRate));
      const buyIX = await program.methods
        .buy({
          amount: new anchor.BN(buyAmount.toString()),
          maxPay: new anchor.BN((payWithoutFee + fee).toString()),
        })
        .accountsPartial({
          config: cfgAcctKeypair.publicKey,
          coin: coinPda,
          coinRecipient: coinRecipientAta,
          feeRecipient: feeRecipientKeypair.publicKey,
          coinVault: coinVaultAta,
          solVault: solVaultPda,
          payer: payer.publicKey,
        })
        .instruction();
      const receiveWithoutFee = BigInt(1e9);
      const totalReceive =
        (receiveWithoutFee * FEE_RATE_BASIS_POINT) / (FEE_RATE_BASIS_POINT - BigInt(cfg.takerFeeRate));
      const amountToSell = sell_exact_out(MAX_COIN_SUPPLY - buyAmount, totalReceive);
      const sellIX = await program.methods
        .sellExactOut({
          receive: new anchor.BN(receiveWithoutFee.toString()),
          maxPay: new anchor.BN((amountToSell - 1n).toString()),
        })
        .accountsPartial({
          config: cfgAcctKeypair.publicKey,
          coin: coinPda,
          feeRecipient: feeRecipientKeypair.publicKey,
          coinVault: coinVaultAta,
          solVault: solVaultPda,
          solRecipient: wallet.publicKey,
          payer: payer.publicKey,
          coinPayer: coinRecipientAta,
        })
        .instruction();

      const transaction = new anchor.web3.Transaction();
      transaction.add(createAtaIX, buyIX, sellIX);
      try {
        await sendAndConfirmTransaction(transaction, wallet, payer);
        expect.fail("should have failed");
      } catch (e) {
        expect(e instanceof anchor.web3.SendTransactionError).to.be.true;
        const sendTxError = e as anchor.web3.SendTransactionError;
        expect(sendTxError.message.includes(BigInt(6010).toString(16))).to.be.true;
      }
    });

    it("should failed if payer balance insufficient", async () => {
      const { cfgAcctKeypair, feeRecipientKeypair, cfg } = await initializeConfig();
      const { mintKeypair, coinPda, coinVaultAta, solVaultPda } = await createCoin(
        cfgAcctKeypair.publicKey,
        feeRecipientKeypair.publicKey
      );

      const payer = anchor.web3.Keypair.generate();
      const payerBalanceBefore = 1e9 * 100;
      const tx = await anchor.getProvider().connection.requestAirdrop(payer.publicKey, payerBalanceBefore);
      await confirmTransaction(tx);

      const coinRecipientAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, payer.publicKey);
      const createAtaIX = createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        coinRecipientAta,
        payer.publicKey,
        mintKeypair.publicKey
      );
      const buyAmount = BigInt(1e8) * BigInt(1e6);
      const payWithoutFee = buy(MAX_COIN_SUPPLY, buyAmount);
      const fee = buy_fee(payWithoutFee, BigInt(cfg.makerFeeRate));
      const buyIX = await program.methods
        .buy({
          amount: new anchor.BN(buyAmount.toString()),
          maxPay: new anchor.BN((payWithoutFee + fee).toString()),
        })
        .accountsPartial({
          config: cfgAcctKeypair.publicKey,
          coin: coinPda,
          coinRecipient: coinRecipientAta,
          feeRecipient: feeRecipientKeypair.publicKey,
          coinVault: coinVaultAta,
          solVault: solVaultPda,
          payer: payer.publicKey,
        })
        .instruction();

      const coinRecipientAtaOther = getAssociatedTokenAddressSync(mintKeypair.publicKey, wallet.publicKey);
      const createAtaOtherIX = createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        coinRecipientAtaOther,
        wallet.publicKey,
        mintKeypair.publicKey
      );
      const receiveWithoutFee = BigInt(1e9);
      const totalReceive =
        (receiveWithoutFee * FEE_RATE_BASIS_POINT) / (FEE_RATE_BASIS_POINT - BigInt(cfg.takerFeeRate));
      const amountToSell = sell_exact_out(MAX_COIN_SUPPLY - buyAmount, totalReceive);
      const sellIX = await program.methods
        .sellExactOut({
          receive: new anchor.BN(receiveWithoutFee.toString()),
          maxPay: new anchor.BN(amountToSell.toString()),
        })
        .accountsPartial({
          config: cfgAcctKeypair.publicKey,
          coin: coinPda,
          feeRecipient: feeRecipientKeypair.publicKey,
          coinVault: coinVaultAta,
          solVault: solVaultPda,
          solRecipient: wallet.publicKey,
          payer: wallet.publicKey,
          coinPayer: coinRecipientAtaOther,
        })
        .instruction();

      const transaction = new anchor.web3.Transaction();
      transaction.add(createAtaIX, buyIX, createAtaOtherIX, sellIX);
      try {
        await sendAndConfirmTransaction(transaction, wallet, payer);
        expect.fail("should have failed");
      } catch (e) {
        expect(e instanceof anchor.web3.SendTransactionError);
        const sendTxError = e as anchor.web3.SendTransactionError;
        expect(sendTxError.logs.join(" ").includes("Program log: Error: insufficient funds")).to.be.true;
      }
    });

    it("should failed if migration limit exceeded", async () => {
      const { cfgAcctKeypair, feeRecipientKeypair, cfg } = await initializeConfig();
      const { mintKeypair, coinPda, coinVaultAta, solVaultPda } = await createCoin(
        cfgAcctKeypair.publicKey,
        feeRecipientKeypair.publicKey
      );

      const payer = anchor.web3.Keypair.generate();
      const payerBalanceBefore = 1e9 * 100;
      const tx = await anchor.getProvider().connection.requestAirdrop(payer.publicKey, payerBalanceBefore);
      await confirmTransaction(tx);

      const coinRecipientAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, payer.publicKey);
      const createAtaIX = createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        coinRecipientAta,
        payer.publicKey,
        mintKeypair.publicKey
      );
      const payWithoutFee = buy(MAX_COIN_SUPPLY, SELLABLE_COINS);
      const fee = buy_fee(payWithoutFee, BigInt(cfg.makerFeeRate));
      const buyIX = await program.methods
        .buy({
          amount: new anchor.BN(SELLABLE_COINS.toString()),
          maxPay: new anchor.BN((payWithoutFee + fee).toString()),
        })
        .accountsPartial({
          config: cfgAcctKeypair.publicKey,
          coin: coinPda,
          coinRecipient: coinRecipientAta,
          feeRecipient: feeRecipientKeypair.publicKey,
          coinVault: coinVaultAta,
          solVault: solVaultPda,
          payer: payer.publicKey,
        })
        .instruction();
      const sellIX = await program.methods
        .sellExactOut({
          receive: new anchor.BN(1),
          maxPay: new anchor.BN(0),
        })
        .accountsPartial({
          config: cfgAcctKeypair.publicKey,
          coin: coinPda,
          feeRecipient: feeRecipientKeypair.publicKey,
          coinVault: coinVaultAta,
          solVault: solVaultPda,
          solRecipient: wallet.publicKey,
          payer: payer.publicKey,
          coinPayer: coinRecipientAta,
        })
        .instruction();

      const transaction = new anchor.web3.Transaction();
      transaction.add(createAtaIX, buyIX, sellIX);
      try {
        await sendAndConfirmTransaction(transaction, wallet, payer);
        expect.fail("should have failed");
      } catch (e) {
        expect(e instanceof anchor.web3.SendTransactionError).to.be.true;
        const sendTxError = e as anchor.web3.SendTransactionError;
        expect(sendTxError.message.includes(BigInt(6012).toString(16))).to.be.true;
      }
    });

    it("should succeed", async () => {
      const { cfgAcctKeypair, feeRecipientKeypair, cfg } = await initializeConfig();
      const { mintKeypair, coinPda, coinVaultAta, solVaultPda } = await createCoin(
        cfgAcctKeypair.publicKey,
        feeRecipientKeypair.publicKey
      );

      const payer = anchor.web3.Keypair.generate();
      const payerBalanceBefore = 1e9 * 100;
      const tx = await anchor.getProvider().connection.requestAirdrop(payer.publicKey, payerBalanceBefore);
      await confirmTransaction(tx);

      const solVaultBalanceBefore = await anchor.getProvider().connection.getBalance(solVaultPda);
      const feeRecipientBalanceBefore = await anchor.getProvider().connection.getBalance(feeRecipientKeypair.publicKey);

      const coinRecipientAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, payer.publicKey);
      const createAtaIX = createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        coinRecipientAta,
        payer.publicKey,
        mintKeypair.publicKey
      );
      const buyAmount = BigInt(1e8) * BigInt(1e6);
      const payWithoutFee = buy(MAX_COIN_SUPPLY, buyAmount);
      const fee = buy_fee(payWithoutFee, BigInt(cfg.makerFeeRate));
      const buyIX = await program.methods
        .buy({
          amount: new anchor.BN(buyAmount.toString()),
          maxPay: new anchor.BN((payWithoutFee + fee).toString()),
        })
        .accountsPartial({
          config: cfgAcctKeypair.publicKey,
          coin: coinPda,
          coinRecipient: coinRecipientAta,
          feeRecipient: feeRecipientKeypair.publicKey,
          coinVault: coinVaultAta,
          solVault: solVaultPda,
          payer: payer.publicKey,
        })
        .instruction();
      const receiveWithoutFee = BigInt(1e9);
      const totalReceive =
        (receiveWithoutFee * FEE_RATE_BASIS_POINT) / (FEE_RATE_BASIS_POINT - BigInt(cfg.takerFeeRate));
      const sellFee = totalReceive - receiveWithoutFee;
      const amountToSell = sell_exact_out(MAX_COIN_SUPPLY - buyAmount, totalReceive);
      const sellIX = await program.methods
        .sellExactOut({
          receive: new anchor.BN(receiveWithoutFee.toString()),
          maxPay: new anchor.BN(amountToSell.toString()),
        })
        .accountsPartial({
          config: cfgAcctKeypair.publicKey,
          coin: coinPda,
          feeRecipient: feeRecipientKeypair.publicKey,
          coinVault: coinVaultAta,
          solVault: solVaultPda,
          solRecipient: payer.publicKey,
          payer: payer.publicKey,
          coinPayer: coinRecipientAta,
        })
        .instruction();

      const transaction = new anchor.web3.Transaction();
      transaction.add(createAtaIX, buyIX, sellIX);
      await sendAndConfirmTransaction(transaction, wallet, payer);

      const solVaultBalanceAfter = await anchor.getProvider().connection.getBalance(solVaultPda);
      const feeRecipientBalanceAfter = await anchor.getProvider().connection.getBalance(feeRecipientKeypair.publicKey);
      expect(feeRecipientBalanceAfter - feeRecipientBalanceBefore).to.eq(Number(fee + sellFee));
      expect(solVaultBalanceAfter - solVaultBalanceBefore).to.eq(Number(payWithoutFee - totalReceive));
      const payerBalanceAfter = await anchor.getProvider().connection.getBalance(payer.publicKey);
      expect(payerBalanceBefore - payerBalanceAfter).to.eq(Number(payWithoutFee + fee - (totalReceive - sellFee)));

      const coinRecipientBalanceAfter = await getAccount(anchor.getProvider().connection, coinRecipientAta);
      expect(coinRecipientBalanceAfter.amount).to.eq(buyAmount - amountToSell);

      const coinVaultBalanceAfter = await getAccount(anchor.getProvider().connection, coinVaultAta);
      expect(coinVaultBalanceAfter.amount + (buyAmount - amountToSell)).to.eq(MAX_COIN_SUPPLY);

      const { remainingCoinSupply, accumulateSol } = await program.account.coin.fetch(coinPda);
      expect(remainingCoinSupply.toNumber() + Number(buyAmount - amountToSell)).to.eq(Number(MAX_COIN_SUPPLY));
      expect(accumulateSol.toNumber()).to.eq(Number(payWithoutFee - totalReceive));
    });
  });

  async function initializeConfig(
    createCoinFee: anchor.BN = new anchor.BN(1e9),
    makerFeeRate: number = Number((FEE_RATE_BASIS_POINT * 1n) / 100n),
    takerFeeRate: number = Number((FEE_RATE_BASIS_POINT * 1n) / 100n)
  ) {
    const cfgAcctKeypair = anchor.web3.Keypair.generate();
    const authorityKeypair = anchor.web3.Keypair.generate();
    const feeRecipientKeypair = anchor.web3.Keypair.generate();
    const migrationKeypair = anchor.web3.Keypair.generate();
    let cfg = {
      authority: authorityKeypair.publicKey,
      feeRecipient: feeRecipientKeypair.publicKey,
      migrationAuthority: migrationKeypair.publicKey,
      createCoinFee: createCoinFee,
      makerFeeRate: makerFeeRate,
      takerFeeRate: takerFeeRate,
    };
    await program.methods
      .initializeConfig(cfg)
      .accounts({
        config: cfgAcctKeypair.publicKey,
      })
      .signers([cfgAcctKeypair])
      .rpc();
    return {
      cfgAcctKeypair,
      authorityKeypair,
      feeRecipientKeypair,
      migrationKeypair,
      cfg,
    };
  }

  async function createCoin(
    cfgAcct: anchor.web3.PublicKey,
    feeRecipient: anchor.web3.PublicKey,
    name: string = "Coin name",
    symbol: string = "CS",
    uri: string = "https://example.org"
  ) {
    const mintKeypair = anchor.web3.Keypair.generate();
    const [metadataPda, metadataBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from(METADATA_SEED), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mintKeypair.publicKey.toBuffer()],
      TOKEN_METADATA_PROGRAM_ID
    );
    const args = {
      name: name,
      symbol: symbol,
      uri: uri,
    };
    const [coinPda, coinBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from(COIN_SEED), mintKeypair.publicKey.toBuffer()],
      program.programId
    );
    const [solVaultPda, solVaultBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from(SOL_VAULT_SEED), mintKeypair.publicKey.toBuffer()],
      program.programId
    );
    const coinVaultAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, coinPda, true);
    await program.methods
      .create(args)
      .accountsPartial({
        config: cfgAcct,
        coin: coinPda,
        coinMint: mintKeypair.publicKey,
        coinVault: coinVaultAta,
        solVault: solVaultPda,
        tokenMetadata: metadataPda,
        feeRecipient: feeRecipient,
      })
      .signers([wallet, mintKeypair])
      .rpc();

    return { mintKeypair, metadataPda, coinPda, coinVaultAta, solVaultPda };
  }

  async function sendAndConfirmTransaction(tx: anchor.web3.Transaction, ...signers: Array<anchor.web3.Keypair>) {
    const { lastValidBlockHeight, blockhash } = await anchor.getProvider().connection.getLatestBlockhash();
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.recentBlockhash = blockhash;
    tx.sign(...signers);
    const signature = await anchor.getProvider().connection.sendRawTransaction(tx.serialize());
    await confirmTransaction(signature);
    return { signature };
  }

  async function confirmTransaction(signature: anchor.web3.TransactionSignature) {
    const { lastValidBlockHeight, blockhash } = await anchor.getProvider().connection.getLatestBlockhash();
    await anchor.getProvider().connection.confirmTransaction(
      {
        signature: signature,
        blockhash: blockhash,
        lastValidBlockHeight: lastValidBlockHeight,
      },
      "confirmed"
    );
  }
});
