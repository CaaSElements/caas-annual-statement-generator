import { html, css, LitElement } from 'lit';
import { jsPDF } from 'jspdf';

export class CaasAnnualStatementGenerator extends LitElement {
	static get styles() {
		return css`
			:host {
				display: block;
				padding: 25px;
				color: var(--annual-statement-generator-text-color, #000);
			}
		`;
	}

	static get properties() {
		return {
			title: { type: String },
			counter: { type: Number },
			wordsarray: { type: String },

			investor: { type: Object },
			contracts: { type: Array },
			repayments: { type: Object },
			lastYear: { type: Number },
			referenceYearStart: { type: Number },
			referenceYearEnd: { type: Number },
			repaymentCampaigns: { type: Array },
			repaymentCampaignsPayedOnTime: { type: Array, value: [] },
			contractTypeIds: { type: Object },
			filename: { type: String },
			hasFreedomInvestments: Boolean,
		};
	}

	constructor() {
		super();
		this.contractTypeIds = {
			preSale: [1, 2],
			loan: [3, 4, 7, 8],
			stocks: [5, 6],
		};
		this.filename = 'jaaropgave';
	}

	firstUpdated() {
		this.referenceYearStart = new Date(this.lastYear, 0).getTime() / 1000;
		this.referenceYearEnd = new Date(this.lastYear, 12).getTime() / 1000;

		this.repaymentCampaigns = this._parseRepaymentCampaigns(this.repayments, this.referenceYearEnd);
		this.repaymentCampaignsPayedOnTime = this._parseRepaymentCampaignsPayedOnTime(this.repaymentCampaigns);
		this.hasFreedomInvestments = this._hasFreedomInvestments();
	}

	updated(changedProps) {
		if (changedProps.has('lastYear')) {
			this.referenceYearStart = new Date(this.lastYear, 0).getTime() / 1000;
			this.referenceYearEnd = new Date(this.lastYear, 12).getTime() / 1000;

			this.repaymentCampaigns = this._parseRepaymentCampaigns(this.repayments, this.referenceYearEnd);
			this.repaymentCampaignsPayedOnTime = this._parseRepaymentCampaignsPayedOnTime(this.repaymentCampaigns);
		}
	}

	_parseRepaymentCampaigns(repayments, referenceYearEnd) {
		var repaymentCampaigns = [];

		repayments.campaigns.forEach(function(campaign) {
			var dateArray = campaign.creationDateTime.replace(/\D/g, ',').split(','); //for some reason Safari doesnt play nice with european date formats, but splitting the date format up like this will work

			var creationDateTime = new Date(...dateArray).getTime() / 1000;

			if (creationDateTime < referenceYearEnd) {
				repaymentCampaigns.push(campaign.payments);

				if (this._hasFreedomInvestments()) {
					for (let index = 0; index < this.contracts.length; index++) {
						const contract = this.contracts[index];

						if (contract.campaignId == 1748 || contract.campaignId == 2080) {
							const deadlineDateUnix = new Date(contract.deadlineDate).getTime() / 1000;

							if (deadlineDateUnix < referenceYearEnd) {
								const repayment = this.createFreedomRepayment(contract);
								repaymentCampaigns.push(repayment);
							}
						}
					}
				}
				return repaymentCampaigns;
			}
		}, this);

		return repaymentCampaigns;
	}

	_parseRepaymentCampaignsPayedOnTime(repaymentCampaigns) {
		let filteredCampaignIndexes = [];
		for (var i = 0; i < repaymentCampaigns.length; i++) {
			var campaignPaymentsOnTime = this._checkIfCampaignPaymentsAreMadeOnTime(repaymentCampaigns[i]); // check for late payments according to current date

			if (!campaignPaymentsOnTime) {
				filteredCampaignIndexes.push(i);
			}
		}

		for (let y = 0; y < filteredCampaignIndexes.length; y++) {
			repaymentCampaigns.splice(filteredCampaignIndexes[y] - y, 1);
		}

		return repaymentCampaigns;
	}

	_computeActualCurrentlyInvestedCapitalByYearsStart(repayments, referenceTime) {
		// update repayments so it will show in totally invested
		var referenceTimeStamp = new Date(`01-01-${referenceTime}`).getTime() / 1000;
		var campaigns = [];

		repayments.campaigns.forEach(function(campaign, index) {
			var dateArray = campaign.creationDateTime.replace(/\D/g, ',').split(','); //for some reason Safari doesnt play nice with european date formats, but splitting the date format up like this will work

			var creationDateTime = new Date(...dateArray).getTime() / 1000;

			if (creationDateTime < referenceTimeStamp) {
				campaigns.push(campaign.payments);
			}
		});

		var actualInvestedCapital = 0;

		campaigns.forEach(function(campaignPayments) {
			actualInvestedCapital += campaignPayments[0].totalInvestmentAmount; //add principle

			for (var i = 0; i < campaignPayments.length; i++) {
				var payment = campaignPayments[i];

				if (payment.datetime < referenceTimeStamp) {
					actualInvestedCapital -= payment.shareAmount; //subtract from principle
				}
			}
		});

		if (this._hasFreedomInvestments()) {
			actualInvestedCapital = this._updateActualInvestedCapitalFreedomYearStart(
				actualInvestedCapital,
				referenceTimeStamp,
			);
		}

		return actualInvestedCapital;
	}

	_computeActualCurrentlyInvestedCapitalByYearsEnd(campaigns, referenceTime) {
		var actualInvestedCapital = 0;
		campaigns.forEach(function(campaignPayments) {
			actualInvestedCapital += campaignPayments[0].totalInvestmentAmount; //add principle

			for (var i = 0; i < campaignPayments.length; i++) {
				var payment = campaignPayments[i];
				if (payment.datetime < referenceTime) {
					actualInvestedCapital -= payment.shareAmount; //subtract from principle
				}
			}
		});
		return actualInvestedCapital;
	}

	_checkIfCampaignPaymentsAreMadeOnTime(campaignPayments) {
		var nowTimeStamp = new Date().getTime() / 1000;
		var onTime = true;
		var endDate = new Date(this.referenceYearEnd).getTime() / 1000;

		campaignPayments.forEach(function(payment) {
			if (payment.datetime > endDate) {
				return onTime;
			}
			if (payment.datetime < nowTimeStamp && !payment.completed) return (onTime = false);
		});
		return onTime;
	}

	_updateActualInvestedCapitalFreedomYearStart(actualInvestedCapital, referenceTimeStamp) {
		for (let index = 0; index < this.contracts.length; index++) {
			const contract = this.contracts[index];

			const deadlineDateUnix = new Date(contract.deadlineDate).getTime() / 1000;

			if (contract.campaignId == 1748 || contract.campaignId == 2080) {
				if (deadlineDateUnix < referenceTimeStamp) {
					actualInvestedCapital += contract.investment;
				}
			}
		}
		return actualInvestedCapital;
	}

	_filterRepaymentsByYear(repaymentCampaigns, referenceYearStart, referenceYearEnd) {
		var consolidatedPayments = [];
		repaymentCampaigns.forEach(function(campaign) {
			for (var i = 0; i < campaign.length; i++) {
				if (
					campaign[i].datetime > referenceYearStart &&
					campaign[i].datetime < referenceYearEnd &&
					campaign[i].campaignId != 1748 &&
					campaign[i].campaignId != 2080
				) {
					consolidatedPayments.push(campaign[i]);
				}
			}
		});
		return consolidatedPayments;
	}

	_filterContractsByTypeIdsAndReferenceTimes(contracts, contractTypeIds, referenceYearStart, referenceYearEnd) {
		var filteredContracts = contracts.filter(function(contract) {
			var dateArray = contract.creationDateTime.replace(/\D/g, ',').split(','); //for some reason Safari doesnt play nice with european date formats, but splitting the date format up like this will work

			var creationDateTime = new Date(...dateArray).getTime() / 1000;
			return (
				contractTypeIds.indexOf(contract.contractType) !== -1 &&
				creationDateTime > referenceYearStart &&
				creationDateTime < referenceYearEnd
			);
		});
		return filteredContracts;
	}

	createFreedomRepayment(contract) {
		const deadlineDateDutchFormat = this.transformDate(contract.deadlineDate, '-');
		// console.log('deadlineDateDutchFormat', deadlineDateDutchFormat);
		const deadlineDateUnix = new Date(contract.deadlineDate).getTime() / 1000;
		const arr = [];
		const template = {
			date: deadlineDateDutchFormat,
			datetime: deadlineDateUnix, // transfer date to datetime
			repaymentDate: deadlineDateDutchFormat,
			shareRate: 0,
			interestRate: 0,
			minumumPayment: '0',
			minumumInterest: '0',
			iteration: 0,
			paymentIndex: 1,
			indexNumber: 1,
			numberOfPayments: 0,
			invoiceId: false,
			campaignId: contract.campaignId,
			campaignProjectNaam: contract.projectNaam,
			completed: false,
			totalPayment: 0,
			remainingDebtPercentage: 0,
			currentPaymentsStatus: {
				paidPayments: 0,
				unpaidPayments: 0,
				currentDebtPercentage: 100,
				totalLoanPrinciple: 0,
			},
			totalAmountThisPayment: 0,
			debtBeforeThisPayment: 0,
			totalDebt: 0,
			shareAmount: 0,
			interestAmount: 0,
			totalAmount: 0,
			totalInvestmentAmount: contract.investment,
		};
		arr.push(template);
		return arr;
	}

	renderLoanContracts() {
		const contracts = this._filterContractsByTypeIdsAndReferenceTimes(
			this.contracts,
			this.contractTypeIds.loan,
			this.referenceYearStart,
			this.referenceYearEnd,
		);

		return contracts.map(
			contract => html`
				<div
					style="
	                                    width: 100%;
	                                    display: flex;
	                                    border-bottom: 0.5px solid
	                                        rgba(0, 0, 0, 0.16);
	                                    line-height: 30px;
										font-size: 10px;

	                                "
				>
					<div style="width: 50%">${contract.projectNaam}</div>

					<div style="width: 25%; text-align: center">
						<can-date
							value="${contract.creationDateTime}|"
							input-format="YYYY-MM-DD HH:mm:ss"
							format="DD-MM-YYYY"
						></can-date>
					</div>

					<div style="width: 25%; text-align: center">
						€ ${contract.investment}
					</div>
				</div>
			`,
		);
	}

	renderStockContracts() {
		const contracts = this._filterContractsByTypeIdsAndReferenceTimes(
			this.contracts,
			this.contractTypeIds.stocks,
			this.referenceYearStart,
			this.referenceYearEnd,
		);

		const templates = [];
		for (let index = 0; index < contracts.length; index++) {
			const contract = contracts[index];
			const template = html`
				<div
					style="
								width: 100%;
								display: flex;
								border-bottom: 0.5px solid
									rgba(0, 0, 0, 0.16);
								line-height: 30px;
								font-size: 10px;

							"
				>
					<div style="width: 50%">${contract.projectNaam}</div>

					<div style="width: 25%; text-align: center">
						${this.transformDate(contract.creationDateTime, '-')}
					</div>

					<div style="width: 25%; text-align: center">
						€ ${contract.investment}
					</div>
				</div>
			`;
			templates.push(template);
		}
		return templates;
	}

	renderPresaleContracts() {
		const contracts = this._filterContractsByTypeIdsAndReferenceTimes(
			this.contracts,
			this.contractTypeIds.preSale,
			this.referenceYearStart,
			this.referenceYearEnd,
		);

		return contracts.map(
			contract => html`
				<div
					style="
						width: 100%;
						display: flex;
						border-bottom: 0.5px solid
							rgba(0, 0, 0, 0.16);
						line-height: 30px;
					"
				>
					<div style="width: 50%">${contract.projectNaam}</div>

					<div style="width: 25%; text-align: center">
						<can-date
							value="${contract.creationDateTime}|"
							input-format="YYYY-MM-DD HH:mm:ss"
							format="DD-MM-YYYY"
						></can-date>
					</div>

					<div style="width: 25%; text-align: center">${contract.investment}</div>
				</div>
			`,
		);
	}

	renderLoanRepayments() {
		const payments = this._filterRepaymentsByYear(
			this.repaymentCampaignsPayedOnTime,
			this.referenceYearStart,
			this.referenceYearEnd,
		);

		return payments.map(
			payment => html`
				<div
					style="
  	                                    width: 100%;
  	                                    display: flex;
  	                                    border-bottom: 0.5px solid
  	                                        rgba(0, 0, 0, 0.16);
  	                                    line-height: 30px;
  	                                    font-size: 10px;
  	                                "
				>
					<div style="width: 50%">${payment.campaignProjectNaam}</div>

					<div style="width: 25%; text-align: center">${payment.date}</div>

					<div style="width: 25%; text-align: center">
						€ ${this.formatNumber(payment.shareAmount)}
					</div>
				</div>
			`,
		);
	}

	renderInterestRepayments() {
		const payments = this._filterRepaymentsByYear(
			this.repaymentCampaignsPayedOnTime, // dont show on interest payout list
			this.referenceYearStart,
			this.referenceYearEnd,
		);

		return payments.map(
			payment => html`
				<div
					style="
	                                    width: 100%;
	                                    display: flex;
	                                    border-bottom: 0.5px solid
	                                        rgba(0, 0, 0, 0.16);
	                                    line-height: 30px;
	                                    font-size: 10px;
	                                "
				>
					<div style="width: 50%">${payment.campaignProjectNaam}</div>

					<div style="width: 25%; text-align: center">${payment.date}</div>

					<div style="width: 25%; text-align: center">
						€ ${this.formatNumber(payment.interestAmount)}
					</div>
				</div>
			`,
		);
	}

	formatNumber(number, decimals = 2) {
		if (typeof number !== 'number')
			console.error(number, 'is not a number. can-number should be fed numbers, else it starts behaving erratically.');
		number = +number.toFixed(decimals);
		number = number.toLocaleString('nl-NL');
		return number;
	}

	createPDF() {
		const HTML = this.shadowRoot.querySelector('.pdfDocumentWrapper');
		const clone = document.createElement('div');
		clone.innerHTML = HTML.innerHTML;
		clone.style = 'width: 600px; padding:0 25px; font-size: 10px;';
		const filename = this.filename + `${this.lastYear}`;
		const pdf = new jsPDF({ unit: 'px', format: 'a4' });
		const self = this;
		pdf
			.html(clone, {
				callback: function(pdf) {
					self.addFooter(pdf, pdf.internal.getNumberOfPages());
					pdf.save(filename);
				},
				html2canvas: { logging: false, scale: 0.65 },
				margin: [10, 10, 40, 10],
			})
			.then(result => {
				console.log(result);
				const event = new CustomEvent('pdf-render-complete', {
					detail: {
						value: true,
					},
					bubbles: true,
					composed: true,
				});

				this.dispatchEvent(event);
			});
	}

	addFooter(pdf, totalPages) {
		for (var i = totalPages; i >= 1; i--) {
			pdf.setPage(i);

			var str = 'Pagina ' + i + ' van ' + totalPages;
			pdf.setFontSize(10);
			pdf.text(str, 25, pdf.internal.pageSize.height - 20);
		}
	}

	transformDate(date, separator) {
		const p = date.split(/\D/g);
		return [p[2], p[1], p[0]].join(separator);
	}

	_hasFreedomInvestments() {
		var hasFreedomContract = false;
		this.contracts.forEach(contract => {
			if (contract.campaignId == 1748 || contract.campaignId == 2080) {
				hasFreedomContract = true;
			}
		});
		return hasFreedomContract;
	}

	render() {
		const investor = this.investor;
		const lastYear = this.lastYear;
		if (this.referenceYearEnd && this.referenceYearEnd) {
			return html`
				<div
					class="pdfDocumentWrapper"
					style="
	                    padding: 25px 25px 30px;
	                    max-width: 600px;
	                    margin: 0 auto;
	                    background-color: #fff;
	                "
				>
					<img src="/apple-touch-icon-76x76.png" alt="logo" />
					<br />
					<br />
					<h4 style="font-size: 12px">${investor.bankTenaam}</h4>
					<div>
						<p style="font-size: 10px; line-height: 16px">
							${investor.address.street} ${investor.address.houseNumber}<br />
							${investor.address.postalCode}
							<br />
							${investor.address.city}
						</p>
					</div>
					<h3 style="font-size: 16px">${lastYear}</h3>
					<br />
					<div class="tableHeader" style="display: flex">
						<div style="width: 50%">
							<h4 style="font-size: 12px; font-weight: 500">
								Waarde beleggingen op:
							</h4>
						</div>
						<div style="width: 25%; text-align: center; font-size: 10px; align-self:center">
							01-01-${lastYear}
						</div>
						<div style="width: 25%; text-align: center;  align-self:center">
							€ ${this.formatNumber(this._computeActualCurrentlyInvestedCapitalByYearsStart(this.repayments, lastYear))}
						</div>
					</div>

					<div class="tableBodyHolder" style="display: flex; flex-direction: column">
						<div class="tableBodyLoan" style="font-size: 10px">
							<div style="width: 100%">
								<h4 style="font-size: 12px">
									<i>Inleg leningen</i>
								</h4>
							</div>
						</div>
						${this.renderLoanContracts()}

						<!-- block for stock investments only for freedom -->
						${this.hasFreedomInvestments
							? html`
									<div class="presale" style="font-size: 10px">
										<div style="width: 100%">
											<h4 style="font-size: 12px">
												<i>Inleg aandelen</i>
											</h4>
										</div>
									</div>
									${this.renderStockContracts()}
							  `
							: ''}
						<!-- block for stock investments only for freedom -->

						<div class="presale" style="font-size: 10px">
							<div style="width: 100%">
								<h4 style="font-size: 12px">
									<i>Inleg voorverkoop</i>
								</h4>
							</div>
						</div>
						${this.renderPresaleContracts()}

						<div class="repayments">
							<div style="width: 100%">
								<h4 style="font-size: 12px">
									<i>Aflossingen leningen</i>
								</h4>
							</div>
						</div>
						${this.renderLoanRepayments()}

						<br />
						<div class="interestRepayments">
							<div style="width: 100%">
								<h4 style="font-size: 12px">
									<i>Aflossingen rente</i>
								</h4>
							</div>
							${this.renderInterestRepayments()}
						</div>
						<br />
						<div class="sumAmount">
							<div
								style="
	                                width: 100%;
	                                display: flex;
	                                border-bottom: 0.5px solid rgba(0, 0, 0, 0.16);
	                                line-height: 30px;
	                                font-size: 10px;
	                            "
							>
								<div style="width: 50%">
									<h3 style="font-size: 12px">Waarde beleggingen op</h3>
								</div>

								<div style="width: 25%; text-align: center; align-self:center">
									31-12-${lastYear}
								</div>

								<div style="width: 25%; text-align: center;  align-self:center">
									€
									${this.formatNumber(
										this._computeActualCurrentlyInvestedCapitalByYearsEnd(
											this.repaymentCampaignsPayedOnTime,
											this.referenceYearEnd,
										),
									)}
								</div>
							</div>
						</div>
						<br />
						<br />
						<div
							class="footer"
							style="
	                            display: flex;
	                            justify-content: space-between;
	                            font-size: 10px;
	                            line-height: 14px;
	                        "
						>
							<div>
								<div>Herenstraat 35</div>
								<div>3512KB Utrecht</div>
								<div>06-49099097</div>
								<div>info@crowdaboutnow.nl</div>
								<div>crowdaboutnow.nl</div>
							</div>

							<div>
								<div>BIC RABONL2U</div>
								<div>IBAN NL09RABO0351492100</div>
								<div>KVK 30286818</div>
								<div>BTW NL822343095 B01</div>
								<div>crowdaboutnow.nl</div>
							</div>
						</div>
					</div>
				</div>
			`;
		}
	}
}
