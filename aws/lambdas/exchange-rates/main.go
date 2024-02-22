package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/s3/s3manager"
)

type RatesResponse struct {
	Base  string             `json:"base"`
	Rates map[string]float64 `json:"rates"`
}

type MerchantRates struct {
	Merchant map[string]map[string]string `json:"merchant"`
}

func getExchangeRates(apiURL string) (map[string]map[string]string, error) {
	client := &http.Client{Timeout: 15 * time.Second}
	response, err := client.Get(apiURL)
	if err != nil {
		return nil, fmt.Errorf("failed to get exchange rates from %s: %w", apiURL, err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("received non-200 response code: %d", response.StatusCode)
	}

	var ratesResponse MerchantRates
	err = json.NewDecoder(response.Body).Decode(&ratesResponse)
	if err != nil {
		return nil, fmt.Errorf("failed to decode response body: %w", err)
	}

	return ratesResponse.Merchant, nil
}

func transformToBaseCurrency(baseCurrency string, merchantRates map[string]map[string]string) (*RatesResponse, error) {

	usdRates := make(map[string]float64)

	for currency, rateMap := range merchantRates {
		rateStr, ok := rateMap[baseCurrency]
		if !ok {
			return nil, fmt.Errorf("failed to find %s rate for currency %s in merchant rates", baseCurrency, currency)
		}

		rate, err := strconv.ParseFloat(rateStr, 64)
		if err != nil {
			return nil, fmt.Errorf("failed to convert rate to float64 for currency %s: %v", currency, err)
		}

		usdRates[currency] = rate
	}

	return &RatesResponse{
		Base:  baseCurrency,
		Rates: usdRates,
	}, nil
}

func Handler() (string, error) {
	apiUrl := os.Getenv("API_URL")
	bucketName := os.Getenv("BUCKET_NAME")
	keyName := os.Getenv("KEY_NAME")
	region := os.Getenv("REGION")
	baseCurrency := os.Getenv("BASE_CURRENCY")

	if apiUrl == "" || bucketName == "" || keyName == "" || region == "" {
		return "", errors.New("API_URL, BUCKET_NAME, or KEY_NAME environment variable is not set")
	}

	merchantRates, err := getExchangeRates(apiUrl)
	if err != nil {
		return "", err
	}

	data, err := transformToBaseCurrency(baseCurrency, merchantRates)
	if err != nil {
		return "", err
	}

	dataBytes, err := json.Marshal(data)
	if err != nil {
		return "", err
	}

	sess := session.Must(session.NewSession(&aws.Config{
		Region: aws.String(region)},
	))

	uploader := s3manager.NewUploader(sess)

	_, err = uploader.Upload(&s3manager.UploadInput{
		Bucket: aws.String(bucketName),
		Key:    aws.String(keyName),
		Body:   bytes.NewReader(dataBytes),
	})
	if err != nil {
		return "", err
	}

	return "Successfully uploaded data to " + bucketName + "/" + keyName, nil
}

func main() {
	lambda.Start(Handler)
}
